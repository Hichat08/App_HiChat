import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronRight, CircleDot, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/useAuthStore";
import { TIN_RAW_QUESTIONS } from "@/data/tinMockQuestions";
import { userService } from "@/services/userService";

type OptionLabel = "A" | "B" | "C" | "D";

type ExamOption = {
  displayLabel: OptionLabel;
  text: string;
  isCorrect: boolean;
};

type ExamQuestion = {
  id: number;
  lessonTitle: string;
  questionHtml: string;
  options: ExamOption[];
  correctDisplayLabel: OptionLabel;
};

type ExamResultItem = {
  id: number;
  lessonTitle: string;
  questionHtml: string;
  userAnswerLabel: OptionLabel | null;
  correctDisplayLabel: OptionLabel;
  userAnswerText: string;
  correctAnswerText: string;
  isCorrect: boolean;
};

type ExamSummary = {
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  score: string;
  items: ExamResultItem[];
};

type TinLessonPack = {
  lesson: number;
  title: string;
  count: number;
};

type ExamModeKey =
  | "normal"
  | "mediumHard"
  | "hard"
  | "wrongOnly"
  | "custom"
  | "sprint15"
  | "lesson"
  | "python45";

type AttemptRecord = {
  id: string;
  createdAt: string;
  mode: ExamModeKey;
  score: number;
  total: number;
  correct: number;
  durationMinutes: number;
  lessonAccuracy: Record<string, { total: number; correct: number }>;
};

type ExamMonitorRecord = {
  id: string;
  createdAt: string;
  userId: string;
  username: string;
  displayName: string;
  subjectId: string;
  subjectName: string;
  mode: ExamModeKey;
  score: number;
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  durationMinutes: number;
  lessonAccuracy: Record<string, { total: number; correct: number }>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const shuffleArray = <T,>(items: T[]) => {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
};

const toOptionLabel = (index: number): OptionLabel => {
  if (index === 0) return "A";
  if (index === 1) return "B";
  if (index === 2) return "C";
  return "D";
};

const formatDuration = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

const buildTinExam = (sourceQuestions: typeof TIN_RAW_QUESTIONS, quantity: number) => {
  const picked = shuffleArray(sourceQuestions).slice(0, quantity);

  return picked.map((q, idx) => {
    const rawOptions = [
      { text: q.A, isCorrect: true },
      { text: q.B, isCorrect: false },
      { text: q.C, isCorrect: false },
      { text: q.D, isCorrect: false },
    ];
    const shuffledOptions = shuffleArray(rawOptions).map((opt, optionIndex) => ({
      displayLabel: toOptionLabel(optionIndex),
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));
    const correctDisplayLabel =
      shuffledOptions.find((opt) => opt.isCorrect)?.displayLabel || "A";

    return {
      id: idx + 1,
      lessonTitle: `Bài ${q.lesson} - ${q.title}`,
      questionHtml: q.q,
      options: shuffledOptions,
      correctDisplayLabel,
    } as ExamQuestion;
  });
};

const extractLessonId = (lessonTitle: string) => {
  const match = lessonTitle.match(/Bài\s+(\d+)/i);
  return match ? Number(match[1]) : null;
};

const classifyMistakeReason = (questionHtml: string) => {
  const raw = questionHtml.toLowerCase();
  if (raw.includes("<code>") || raw.includes("python")) return "Lỗi tư duy thuật toán/lập trình";
  if (raw.includes("mạng") || raw.includes("internet")) return "Lỗi kiến thức mạng";
  if (raw.includes("ai") || raw.includes("trí tuệ nhân tạo")) return "Lỗi kiến thức AI";
  return "Lỗi đọc hiểu và chọn đáp án";
};

const persistAdminMonitorRecord = async (record: ExamMonitorRecord) => {
  try {
    await userService.createExamAttempt({
      subjectId: record.subjectId,
      subjectName: record.subjectName,
      mode: record.mode,
      score: record.score,
      total: record.total,
      correct: record.correct,
      incorrect: record.incorrect,
      blank: record.blank,
      durationMinutes: record.durationMinutes,
      lessonAccuracy: record.lessonAccuracy,
    });
    window.dispatchEvent(new Event("hichat-exam-monitor-updated"));
  } catch (error) {
    console.error("save admin exam monitor failed", error);
  }
};

const subjectById: Record<string, string> = {
  tin: "Tin học",
  toan: "Toán",
  van: "Văn",
  su: "Sử",
  "cong-nghe": "Công nghệ",
  ly: "Lý",
  hoa: "Hoá",
  ktpl: "KTPL",
  "tieng-anh": "Tiếng Anh",
};

const MockExamSubjectPage = () => {
  const navigate = useNavigate();
  const { subjectId } = useParams();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?._id || "";
  const displayName = user?.displayName?.trim() || "User Một";

  const currentSubjectName = useMemo(
    () => (subjectId ? subjectById[subjectId] || "Tin học" : "Tin học"),
    [subjectId]
  );
  const isTinSubject = subjectId === "tin";

  const [quickExamOpen, setQuickExamOpen] = useState(false);
  const [allPacksOpen, setAllPacksOpen] = useState(false);
  const [examMode, setExamMode] = useState<ExamModeKey>("normal");
  const [selectedLessonId, setSelectedLessonId] = useState(1);
  const [questionCount, setQuestionCount] = useState("40");
  const [durationMinutes, setDurationMinutes] = useState("90");

  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, OptionLabel>>({});
  const answersRef = useRef<Record<number, OptionLabel>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [summary, setSummary] = useState<ExamSummary | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [attemptHistory, setAttemptHistory] = useState<AttemptRecord[]>([]);
  const [wrongQuestionSet, setWrongQuestionSet] = useState<Record<string, true>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
  const [activeMode, setActiveMode] = useState<ExamModeKey>("normal");
  const [examDataLoading, setExamDataLoading] = useState(false);

  const hasExam = examQuestions.length > 0;
  const isRunning = hasExam && !submitted;
  const currentQuestion = examQuestions[currentQuestionIndex] || null;
  const currentQuestionKey = currentQuestion?.questionHtml || "";
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const unansweredCount = useMemo(
    () => Math.max(examQuestions.length - answeredCount, 0),
    [examQuestions.length, answeredCount]
  );
  const progressPct = useMemo(() => {
    if (!examQuestions.length) return 0;
    return Math.round((answeredCount / examQuestions.length) * 100);
  }, [answeredCount, examQuestions.length]);
  const lowTimeWarning = isRunning && secondsLeft <= 300;
  const tinLessonPacks = useMemo<TinLessonPack[]>(() => {
    const lessonMap = new Map<number, TinLessonPack>();
    for (const question of TIN_RAW_QUESTIONS) {
      const current = lessonMap.get(question.lesson);
      if (current) {
        current.count += 1;
      } else {
        lessonMap.set(question.lesson, {
          lesson: question.lesson,
          title: question.title,
          count: 1,
        });
      }
    }
    return Array.from(lessonMap.values()).sort((a, b) => a.lesson - b.lesson);
  }, []);

  useEffect(() => {
    if (!isTinSubject || !currentUserId) return;
    let cancelled = false;

    const loadExamData = async () => {
      try {
        setExamDataLoading(true);
        const [attemptRes, stateRes] = await Promise.all([
          userService.listMyExamAttempts({ subjectId: subjectId || "tin", limit: 100 }),
          userService.getMyExamState(subjectId || "tin"),
        ]);
        if (cancelled) return;

        const normalizedAttempts: AttemptRecord[] = (attemptRes?.attempts || [])
          .map((item) => ({
            id: item._id,
            createdAt: item.createdAt,
            mode: item.mode,
            score: item.score,
            total: item.total,
            correct: item.correct,
            durationMinutes: item.durationMinutes,
            lessonAccuracy: item.lessonAccuracy || {},
          }))
          .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
          .slice(-50);
        setAttemptHistory(normalizedAttempts);

        const wrongMap: Record<string, true> = {};
        (stateRes?.wrongQuestionSet || []).forEach((questionHtml) => {
          if (questionHtml) wrongMap[questionHtml] = true;
        });
        setWrongQuestionSet(wrongMap);
        setNoteMap(stateRes?.noteMap || {});
      } catch (error) {
        console.error("load exam data from mongodb failed", error);
      } finally {
        if (!cancelled) setExamDataLoading(false);
      }
    };

    void loadExamData();
    return () => {
      cancelled = true;
    };
  }, [isTinSubject, currentUserId, subjectId]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!tinLessonPacks.length) return;
    if (tinLessonPacks.some((item) => item.lesson === selectedLessonId)) return;
    setSelectedLessonId(tinLessonPacks[0].lesson);
  }, [selectedLessonId, tinLessonPacks]);

  useEffect(() => {
    if (examMode === "normal") {
      setQuestionCount("40");
      setDurationMinutes("60");
      return;
    }
    if (examMode === "mediumHard") {
      setQuestionCount("45");
      setDurationMinutes("75");
      return;
    }
    if (examMode === "hard") {
      setQuestionCount("50");
      setDurationMinutes("90");
      return;
    }
    if (examMode === "wrongOnly") {
      const wrongCount = Object.keys(wrongQuestionSet).length;
      setQuestionCount(String(Math.min(Math.max(wrongCount, 5), 40)));
      setDurationMinutes("45");
      return;
    }
    if (examMode === "sprint15") {
      setQuestionCount("20");
      setDurationMinutes("15");
      return;
    }
    if (examMode === "python45") {
      setQuestionCount("40");
      setDurationMinutes("45");
      return;
    }
    if (examMode === "lesson") {
      const lessonCount =
        tinLessonPacks.find((item) => item.lesson === selectedLessonId)?.count || 40;
      setQuestionCount(String(Math.min(lessonCount, 40)));
      setDurationMinutes("45");
    }
  }, [examMode, selectedLessonId, tinLessonPacks, wrongQuestionSet]);

  const totalAttempts = attemptHistory.length;
  const averageScore = useMemo(() => {
    if (!attemptHistory.length) return 0;
    const sum = attemptHistory.reduce((acc, item) => acc + item.score, 0);
    return Number((sum / attemptHistory.length).toFixed(2));
  }, [attemptHistory]);
  const recentAttempts = useMemo(
    () => [...attemptHistory].slice(-7),
    [attemptHistory]
  );
  const weeklyAverage = useMemo(() => {
    if (!recentAttempts.length) return 0;
    const sum = recentAttempts.reduce((acc, item) => acc + item.score, 0);
    return Number((sum / recentAttempts.length).toFixed(2));
  }, [recentAttempts]);
  const weeklyGoalProgress = useMemo(() => {
    const goal = 5;
    return Math.min(100, Math.round((recentAttempts.length / goal) * 100));
  }, [recentAttempts.length]);
  const streakDays = useMemo(() => {
    if (!attemptHistory.length) return 0;
    const dateSet = new Set(
      attemptHistory.map((item) =>
        new Date(item.createdAt).toISOString().slice(0, 10)
      )
    );
    let streak = 0;
    const cursor = new Date();
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (!dateSet.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [attemptHistory]);
  const weakLessons = useMemo(() => {
    const acc = new Map<number, { total: number; correct: number }>();
    attemptHistory.forEach((attempt) => {
      Object.entries(attempt.lessonAccuracy).forEach(([lessonKey, value]) => {
        const lesson = Number(lessonKey);
        const curr = acc.get(lesson) || { total: 0, correct: 0 };
        curr.total += value.total;
        curr.correct += value.correct;
        acc.set(lesson, curr);
      });
    });
    return tinLessonPacks
      .map((pack) => {
        const stat = acc.get(pack.lesson);
        const ratio = stat && stat.total > 0 ? (stat.correct / stat.total) * 100 : 0;
        return {
          ...pack,
          ratio: Number(ratio.toFixed(1)),
          attempts: stat?.total || 0,
        };
      })
      .sort((a, b) => a.ratio - b.ratio);
  }, [attemptHistory, tinLessonPacks]);
  const recommendation = useMemo(() => {
    if (Object.keys(wrongQuestionSet).length >= 5) {
      return "Ôn sai: ưu tiên làm chế độ Ôn câu sai để vá lỗ hổng nhanh.";
    }
    const weak = weakLessons.find((item) => item.attempts > 0);
    if (weak) {
      return `Ưu tiên luyện chủ đề Bài ${weak.lesson} (${weak.title}) vì độ chính xác còn ${weak.ratio}%.`;
    }
    return "Bắt đầu với Bình thường, sau đó chuyển Trung bình khó khi đạt trên 8.0 điểm.";
  }, [weakLessons, wrongQuestionSet]);
  const earnedBadges = useMemo(() => {
    const badges: string[] = [];
    if (totalAttempts >= 1) badges.push("Khởi động");
    if (streakDays >= 3) badges.push("Chuỗi 3 ngày");
    if (averageScore >= 8) badges.push("Ổn định 8+");
    if (Object.keys(wrongQuestionSet).length === 0 && totalAttempts > 0) badges.push("Không còn câu sai");
    return badges;
  }, [averageScore, streakDays, totalAttempts, wrongQuestionSet]);
  const mistakeGroups = useMemo(() => {
    if (!summary) return [] as Array<{ reason: string; count: number }>;
    const map = new Map<string, number>();
    summary.items
      .filter((item) => !item.isCorrect)
      .forEach((item) => {
        const reason = classifyMistakeReason(item.questionHtml);
        map.set(reason, (map.get(reason) || 0) + 1);
      });
    return Array.from(map.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [summary]);

  useEffect(() => {
    if (isTinSubject) return;
    setQuickExamOpen(false);
    setAllPacksOpen(false);
    setExamQuestions([]);
    setAnswers({});
    setSecondsLeft(0);
    setSubmitted(false);
    setSummary(null);
    setShowDetail(false);
    setCurrentQuestionIndex(0);
  }, [isTinSubject, subjectId]);

  useEffect(() => {
    if (!isRunning) return undefined;
    if (secondsLeft <= 0) return undefined;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  useEffect(() => {
    if (!isRunning) return;
    if (secondsLeft > 0) return;

    if (!submitted) {
      toast.info("Hết thời gian, hệ thống đã tự động nộp bài.");
      handleSubmitExam(true);
    }
  }, [isRunning, secondsLeft, submitted]);

  useEffect(() => {
    if (!currentQuestionKey) {
      setNoteDraft("");
      return;
    }
    setNoteDraft(noteMap[currentQuestionKey] || "");
  }, [currentQuestionKey, noteMap]);

  const startExamSession = (
    sourceQuestions: typeof TIN_RAW_QUESTIONS,
    parsedQuantity: number,
    parsedDuration: number,
    mode: ExamModeKey
  ) => {
    const safeQuantity = clamp(parsedQuantity, 5, sourceQuestions.length);
    const safeDuration = clamp(parsedDuration, 5, 180);
    const generated = buildTinExam(sourceQuestions, safeQuantity);

    setExamQuestions(generated);
    setAnswers({});
    answersRef.current = {};
    setSecondsLeft(safeDuration * 60);
    setSubmitted(false);
    setSummary(null);
    setShowDetail(false);
    setCurrentQuestionIndex(0);
    setExamStartedAt(Date.now());
    setActiveMode(mode);
    setQuickExamOpen(false);
    setAllPacksOpen(false);
  };

  const persistMyExamState = async (
    nextWrongQuestionSet: Record<string, true>,
    nextNoteMap: Record<string, string>,
  ) => {
    if (!isTinSubject || !currentUserId) return;
    try {
      await userService.upsertMyExamState({
        subjectId: subjectId || "tin",
        wrongQuestionSet: Object.keys(nextWrongQuestionSet),
        noteMap: nextNoteMap,
      });
    } catch (error) {
      console.error("save exam state to mongodb failed", error);
      toast.error("Không thể lưu tiến độ luyện thi lên hệ thống.");
    }
  };

  const handleStartExam = () => {
    if (!isTinSubject) {
      toast.info(`Ngân hàng câu hỏi môn ${currentSubjectName} đang cập nhật.`);
      return;
    }

    if (examMode === "normal") {
      startExamSession(TIN_RAW_QUESTIONS, 40, 60, "normal");
      return;
    }
    if (examMode === "mediumHard") {
      const mediumHardQuestions = TIN_RAW_QUESTIONS.filter((item) => item.lesson >= 4);
      const source = mediumHardQuestions.length >= 10 ? mediumHardQuestions : TIN_RAW_QUESTIONS;
      startExamSession(source, 45, 75, "mediumHard");
      return;
    }
    if (examMode === "hard") {
      const hardQuestions = TIN_RAW_QUESTIONS.filter((item) => item.lesson >= 6);
      const source = hardQuestions.length >= 10 ? hardQuestions : TIN_RAW_QUESTIONS;
      startExamSession(source, 50, 90, "hard");
      return;
    }
    if (examMode === "wrongOnly") {
      const wrongOnlyQuestions = TIN_RAW_QUESTIONS.filter(
        (item) => !!wrongQuestionSet[item.q]
      );
      if (wrongOnlyQuestions.length < 5) {
        toast.info("Chưa đủ câu sai để mở chế độ Ôn câu sai (cần ít nhất 5 câu).");
        return;
      }
      startExamSession(wrongOnlyQuestions, Math.min(40, wrongOnlyQuestions.length), 45, "wrongOnly");
      return;
    }
    if (examMode === "sprint15") {
      startExamSession(TIN_RAW_QUESTIONS, 20, 15, "sprint15");
      return;
    }

    if (examMode === "python45") {
      const pythonQuestions = TIN_RAW_QUESTIONS.filter((item) => item.lesson === 8);
      if (pythonQuestions.length < 5) {
        toast.error("Chưa có đủ câu hỏi Python để mở chế độ này.");
        return;
      }
      startExamSession(pythonQuestions, 40, 45, "python45");
      return;
    }

    let sourceQuestions = TIN_RAW_QUESTIONS;
    if (examMode === "lesson") {
      sourceQuestions = TIN_RAW_QUESTIONS.filter((item) => item.lesson === selectedLessonId);
      if (sourceQuestions.length < 5) {
        toast.error("Chủ đề này chưa đủ câu hỏi để thi.");
        return;
      }
    }

    const parsedQuantity = Number.parseInt(questionCount, 10);
    const parsedDuration = Number.parseInt(durationMinutes, 10);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("Số câu thi không hợp lệ.");
      return;
    }
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      toast.error("Thời gian thi không hợp lệ.");
      return;
    }
    startExamSession(
      sourceQuestions,
      parsedQuantity,
      parsedDuration,
      examMode === "lesson" ? "lesson" : "custom"
    );
  };

  const handleStartPackExam = (pack: TinLessonPack) => {
    const sourceQuestions = TIN_RAW_QUESTIONS.filter((item) => item.lesson === pack.lesson);
    if (sourceQuestions.length < 5) {
      toast.error("Bộ đề này chưa đủ dữ liệu để thi.");
      return;
    }
    const quantity = Math.min(sourceQuestions.length, 40);
    const duration = Math.max(15, Math.ceil(quantity * 1.5));
    startExamSession(sourceQuestions, quantity, duration, "lesson");
    toast.success(`Đã mở đề: Bài ${pack.lesson}`);
  };

  const handleChooseAnswer = (questionId: number, label: OptionLabel) => {
    if (submitted) return;
    const nextAnswers = { ...answersRef.current, [questionId]: label };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setTimeout(() => {
      setCurrentQuestionIndex((prev) => {
        if (prev >= examQuestions.length - 1) {
          toast.message("Đã chọn đáp án câu cuối, bấm \"Nộp bài\" để hoàn tất.");
          return prev;
        }
        return prev + 1;
      });
    }, 120);
  };

  const handleSubmitExam = (force = false, providedAnswers?: Record<number, OptionLabel>) => {
    if (!examQuestions.length) return;
    const answerSnapshot = providedAnswers || answersRef.current;
    const blankNow = examQuestions.length - Object.keys(answerSnapshot).length;
    if (!force && blankNow > 0) {
      const ok = window.confirm(
        `Bạn còn ${blankNow} câu chưa chọn đáp án. Vẫn nộp bài?`
      );
      if (!ok) return;
    }

    let correct = 0;
    let incorrect = 0;
    let blank = 0;
    const lessonAccuracy: Record<string, { total: number; correct: number }> = {};

    const items: ExamResultItem[] = examQuestions.map((q) => {
      const userAnswerLabel = answerSnapshot[q.id] ?? null;
      const isCorrect = userAnswerLabel === q.correctDisplayLabel;
      const correctOption = q.options.find((opt) => opt.displayLabel === q.correctDisplayLabel);
      const userOption = userAnswerLabel
        ? q.options.find((opt) => opt.displayLabel === userAnswerLabel)
        : null;

      if (userAnswerLabel === null) {
        blank += 1;
      } else if (isCorrect) {
        correct += 1;
      } else {
        incorrect += 1;
      }

      const lessonId = extractLessonId(q.lessonTitle);
      if (lessonId !== null) {
        const key = String(lessonId);
        const current = lessonAccuracy[key] || { total: 0, correct: 0 };
        current.total += 1;
        if (isCorrect) current.correct += 1;
        lessonAccuracy[key] = current;
      }

      return {
        id: q.id,
        lessonTitle: q.lessonTitle,
        questionHtml: q.questionHtml,
        userAnswerLabel,
        correctDisplayLabel: q.correctDisplayLabel,
        userAnswerText: userOption?.text || "",
        correctAnswerText: correctOption?.text || "",
        isCorrect,
      };
    });

    const total = examQuestions.length;
    const score = ((correct / total) * 10).toFixed(2);

    const wrongMap = { ...wrongQuestionSet };
    items.forEach((item) => {
      if (item.isCorrect) {
        delete wrongMap[item.questionHtml];
      } else {
        wrongMap[item.questionHtml] = true;
      }
    });
    setWrongQuestionSet(wrongMap);
    void persistMyExamState(wrongMap, noteMap);

    const durationSpentMinutes = examStartedAt
      ? Math.max(1, Math.round((Date.now() - examStartedAt) / 60000))
      : 0;
    const record: AttemptRecord = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      mode: activeMode,
      score: Number(score),
      total,
      correct,
      durationMinutes: durationSpentMinutes,
      lessonAccuracy,
    };
    setAttemptHistory((prev) => [...prev, record].slice(-50));

    void persistAdminMonitorRecord({
      id: record.id,
      createdAt: record.createdAt,
      userId: user?._id || "unknown",
      username: user?.username || "unknown",
      displayName: displayName || "Unknown",
      subjectId: subjectId || "tin",
      subjectName: currentSubjectName,
      mode: activeMode,
      score: Number(score),
      total,
      correct,
      incorrect,
      blank,
      durationMinutes: durationSpentMinutes,
      lessonAccuracy,
    });

    setSummary({ total, correct, incorrect, blank, score, items });
    setSubmitted(true);
    setSecondsLeft(0);
  };

  const handleResetExam = () => {
    setExamQuestions([]);
    setAnswers({});
    answersRef.current = {};
    setSecondsLeft(0);
    setSubmitted(false);
    setSummary(null);
    setShowDetail(false);
    setCurrentQuestionIndex(0);
    setExamStartedAt(null);
  };

  const handleSaveNote = () => {
    if (!currentQuestionKey) return;
    const trimmed = noteDraft.trim();
    const next = { ...noteMap };
    if (!trimmed) {
      delete next[currentQuestionKey];
    } else {
      next[currentQuestionKey] = trimmed;
    }
    setNoteMap(next);
    void persistMyExamState(wrongQuestionSet, next);
    toast.success(trimmed ? "Đã lưu ghi chú câu hỏi." : "Đã xoá ghi chú câu hỏi.");
  };

  return (
    <div className="min-h-screen bg-gradient-purple">
      <div className="mx-auto w-full max-w-4xl space-y-3 px-3 py-3 sm:space-y-4 sm:px-4 sm:py-5">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl px-2 text-slate-700 hover:bg-white/70"
            onClick={() => navigate("/mock-exam-12")}
            title="Quay lại Luyện thi thử 12"
          >
            <ArrowLeft className="size-5" />
            Luyện thi thử 12
          </Button>
          {user?.role === "admin" && (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-white/80 text-xs sm:text-sm"
              onClick={() => navigate("/admin/exam-monitor")}
            >
              Giám sát admin
            </Button>
          )}
        </div>
        {examDataLoading && (
          <p className="text-xs text-muted-foreground">
            Đang đồng bộ dữ liệu luyện thi từ hệ thống...
          </p>
        )}

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">Đã làm</p>
            <p className="text-lg font-bold text-foreground">{totalAttempts}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">TB 7 ngày</p>
            <p className="text-lg font-bold text-foreground">{weeklyAverage.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">Streak</p>
            <p className="text-lg font-bold text-foreground">{streakDays} ngày</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">Điểm TB</p>
            <p className="text-lg font-bold text-foreground">{averageScore.toFixed(2)}</p>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Huy hiệu luyện tập</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {earnedBadges.length > 0 ? (
              earnedBadges.map((badge) => (
                <span
                  key={`badge-${badge}`}
                  className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  {badge}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Chưa mở huy hiệu, hãy bắt đầu làm đề.</span>
            )}
          </div>
          <div className="mt-2 rounded-lg border border-border/70 bg-muted/20 p-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Mục tiêu tuần: 5 đề</span>
              <span className="font-semibold text-foreground">
                {recentAttempts.length}/5
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${weeklyGoalProgress}%` }}
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-soft backdrop-blur">
          <div className="grid gap-0 md:grid-cols-[1.25fr_0.75fr]">
            <div className="p-4 sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-primary sm:text-xs">
                <CircleDot className="size-3.5 sm:size-4" />
                Trang thi học sinh
              </div>

              <h1 className="mt-3 text-2xl font-black leading-tight text-foreground sm:mt-4 sm:text-3xl">
                Xin chào {displayName}, vào thi thôi.
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Làm đề theo thời gian thực, tự chuyển câu sau khi chọn đáp án và chấm điểm ngay
                khi nộp bài.
              </p>
              {!isTinSubject && (
                <p className="mt-3 inline-flex rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                  Môn {currentSubjectName} đang cập nhật ngân hàng câu hỏi.
                </p>
              )}
            </div>

            <div className="flex flex-col justify-center gap-2.5 border-t border-border/60 bg-gradient-glass p-4 sm:p-5 md:border-t-0 md:border-l">
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  if (!isTinSubject) {
                    toast.info(`Môn ${currentSubjectName} đang cập nhật.`);
                    return;
                  }
                  setQuickExamOpen(true);
                }}
                className="h-10 justify-center rounded-lg bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-95"
              >
                Vào thi ngay
                <ChevronRight className="size-4" />
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-10 justify-center rounded-lg border-primary/25 bg-background px-4 text-sm font-semibold text-foreground hover:bg-primary/5"
                onClick={() => {
                  if (!isTinSubject) {
                    toast.info(`Môn ${currentSubjectName} đang cập nhật.`);
                    return;
                  }
                  setAllPacksOpen(true);
                }}
              >
                Xem tất cả đề
              </Button>
              <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                Môn hiện tại: <span className="font-semibold text-foreground">{currentSubjectName}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">Gợi ý lộ trình tiếp theo</p>
            <p className="mt-1 text-sm text-muted-foreground">{recommendation}</p>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {recentAttempts.length === 0 && (
                <p className="col-span-7 text-xs text-muted-foreground">
                  Chưa có dữ liệu biểu đồ. Hãy làm ít nhất 1 đề.
                </p>
              )}
              {recentAttempts.map((attempt) => (
                <div key={attempt.id} className="flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded bg-primary/70"
                    style={{ height: `${Math.max(10, attempt.score * 8)}px` }}
                    title={`Điểm ${attempt.score}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{attempt.score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">Heatmap chủ đề</p>
            <div className="mt-2 space-y-1.5">
              {weakLessons.slice(0, 6).map((item) => (
                <div key={`heat-${item.lesson}`} className="rounded-lg border border-border/70 p-2">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Bài {item.lesson}</span>
                    <span className="text-muted-foreground">{item.ratio}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        item.ratio >= 70
                          ? "bg-emerald-500"
                          : item.ratio >= 50
                            ? "bg-warning"
                            : "bg-destructive"
                      }`}
                      style={{ width: `${Math.min(100, item.ratio)}%` }}
                    />
                  </div>
                </div>
              ))}
              {weakLessons.length === 0 && (
                <p className="text-xs text-muted-foreground">Chưa có dữ liệu theo chủ đề.</p>
              )}
            </div>
          </div>
        </section>

      </div>

      <Dialog open={quickExamOpen} onOpenChange={setQuickExamOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl border-violet-100 p-3.5 sm:p-4">
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg font-bold text-violet-800">Thi nhanh</DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700 sm:text-base">Môn thi</p>
              <select
                value={currentSubjectName}
                disabled
                className="h-10 w-full appearance-none rounded-lg border border-violet-300 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                <option value={currentSubjectName}>{currentSubjectName}</option>
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700 sm:text-base">Đề thi</p>
              <select
                value={examMode}
                onChange={(event) => setExamMode(event.target.value as ExamModeKey)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                <option value="normal">Bình thường (40 câu - 60 phút)</option>
                <option value="mediumHard">Trung bình khó (45 câu - 75 phút)</option>
                <option value="hard">Thi thử khó (50 câu - 90 phút)</option>
                <option value="wrongOnly">Ôn câu sai (45 phút)</option>
                <option value="custom">Tổng hợp tự chọn (câu + thời gian)</option>
                <option value="sprint15">Tăng tốc 15 phút (20 câu)</option>
                <option value="lesson">Theo chủ đề (bài học)</option>
                <option value="python45">Luyện Python 45 phút</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                Gợi ý: Bắt đầu từ Bình thường, sau đó chuyển Trung bình khó và Thi thử khó.
              </p>
            </div>

            {examMode === "lesson" && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 sm:text-base">Chủ đề</p>
                <select
                  value={selectedLessonId}
                  onChange={(event) => setSelectedLessonId(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none"
                >
                  {tinLessonPacks.map((pack) => (
                    <option key={`lesson-opt-${pack.lesson}`} value={pack.lesson}>
                      Bài {pack.lesson} - {pack.title} ({pack.count} câu)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700 sm:text-base">Số câu thi</p>
              <Input
                type="number"
                min={5}
                max={examMode === "lesson"
                  ? (tinLessonPacks.find((pack) => pack.lesson === selectedLessonId)?.count || TIN_RAW_QUESTIONS.length)
                  : TIN_RAW_QUESTIONS.length}
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
                disabled={
                  examMode === "normal" ||
                  examMode === "mediumHard" ||
                  examMode === "hard" ||
                  examMode === "wrongOnly" ||
                  examMode === "sprint15" ||
                  examMode === "python45"
                }
                className="h-10 rounded-lg border-slate-300 px-3 text-sm text-slate-700"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700 sm:text-base">Thời gian (phút)</p>
              <Input
                type="number"
                min={5}
                max={180}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                disabled={
                  examMode === "normal" ||
                  examMode === "mediumHard" ||
                  examMode === "hard" ||
                  examMode === "wrongOnly" ||
                  examMode === "sprint15" ||
                  examMode === "python45"
                }
                className="h-10 rounded-lg border-slate-300 px-3 text-sm text-slate-700"
              />
            </div>
          </div>

          <div className="mt-1 grid grid-cols-1 gap-2">
            <Button type="button" onClick={handleStartExam} className="h-10 rounded-lg text-sm font-semibold">
              Làm bài ngay
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg text-sm font-semibold"
              onClick={() => setQuickExamOpen(false)}
            >
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hasExam}
        onOpenChange={(open) => {
          if (!open) handleResetExam();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-[calc(100vw-20px)] max-w-2xl overflow-hidden rounded-2xl border-violet-100 p-0"
        >
          {!submitted && currentQuestion && (
            <>
              <div className="border-b border-violet-100 bg-violet-50/80 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-violet-800">Làm bài thi nhanh</p>
                  <div className="flex items-center gap-2">
                    <div className={`rounded-md border px-2 py-1 font-mono text-xs font-semibold ${
                      lowTimeWarning
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-violet-200 bg-white text-violet-700"
                    }`}>
                      {formatDuration(secondsLeft)}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 rounded-full text-slate-500 hover:bg-violet-100"
                      onClick={handleResetExam}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">
                    Câu {currentQuestionIndex + 1}/{examQuestions.length}
                  </p>
                  <p className="text-xs text-slate-500">
                    Còn trống {unansweredCount} câu
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed,#c026d3)] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Tiến độ {answeredCount}/{examQuestions.length} ({progressPct}%)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {examQuestions.slice(0, 40).map((q, idx) => (
                    <span
                      key={`mini-${q.id}`}
                      className={`h-1.5 w-3 rounded-full ${
                        idx === currentQuestionIndex
                          ? "bg-primary"
                          : answers[q.id]
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
                {lowTimeWarning && (
                  <p className="mt-1 text-[11px] font-medium text-destructive">
                    Cảnh báo: còn dưới 5 phút, hãy ưu tiên hoàn thành nhanh.
                  </p>
                )}
              </div>

              <div className="max-h-[58vh] overflow-y-auto px-4 py-3">
                <p className="mb-2 text-xs font-medium text-violet-700">
                  {currentQuestion.lessonTitle}
                </p>
                <div
                  className="prose prose-sm max-w-none text-slate-800 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: currentQuestion.questionHtml }}
                />
                <div className="mt-2 space-y-2">
                  {currentQuestion.options.map((option) => {
                    const questionId = currentQuestion.id;
                    const checked = answers[questionId] === option.displayLabel;
                    return (
                      <label
                        key={`${questionId}-${option.displayLabel}`}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          checked
                            ? "border-violet-300 bg-violet-100/70 text-violet-900"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${questionId}`}
                          checked={checked}
                          onChange={() => handleChooseAnswer(questionId, option.displayLabel)}
                          disabled={submitted}
                          className="mt-1"
                        />
                        <span>
                          <b className="inline-flex w-5 justify-center rounded-sm bg-violet-100 text-violet-700">
                            {option.displayLabel}
                          </b>{" "}
                          <span dangerouslySetInnerHTML={{ __html: option.text }} />
                        </span>
                      </label>
                    );
                  })}
                </div>

              </div>

              <div className="border-t border-slate-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0))}
                  >
                    Câu trước
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={currentQuestionIndex >= examQuestions.length - 1}
                      onClick={() =>
                        setCurrentQuestionIndex((prev) =>
                          Math.min(prev + 1, examQuestions.length - 1)
                        )
                      }
                    >
                      Bỏ qua
                    </Button>
                    <Button type="button" size="sm" onClick={() => handleSubmitExam(false)}>
                      Nộp bài
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                  <p className="mb-1 text-xs font-semibold text-foreground">Sổ tay cá nhân cho câu này</p>
                  <Textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Ghi nhanh mẹo nhớ, lỗi dễ sai, công thức..."
                    className="min-h-20 resize-none bg-background text-sm"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={handleSaveNote}>
                      Lưu ghi chú
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {submitted && summary && (
            <section className="max-h-[78vh] overflow-y-auto bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-bold text-violet-800">Kết quả bài thi</h2>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 rounded-full text-slate-500 hover:bg-violet-100"
                  onClick={handleResetExam}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">Tổng câu: {summary.total}</div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">Đúng: {summary.correct}</div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">Sai: {summary.incorrect}</div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">Bỏ trống: {summary.blank}</div>
              </div>
              <p className="mt-3 text-base font-semibold text-violet-700">Điểm: {summary.score}/10</p>
              {mistakeGroups.length > 0 && (
                <div className="mt-2 rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
                  <p className="font-semibold text-foreground">Phân tích lỗi nhanh</p>
                  <div className="mt-1 space-y-1">
                    {mistakeGroups.map((group) => (
                      <p key={group.reason} className="text-muted-foreground">
                        {group.reason}: <span className="font-semibold text-foreground">{group.count} câu</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setShowDetail((prev) => !prev)}>
                  {showDetail ? "Ẩn chi tiết" : "Xem chi tiết"}
                </Button>
                <Button type="button" onClick={handleResetExam}>
                  Đóng
                </Button>
              </div>

              {showDetail && (
                <div className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {summary.items.map((item) => (
                    <div
                      key={`detail-${item.id}`}
                      className={`rounded-lg border p-3 text-sm ${
                        item.isCorrect
                          ? "border-green-200 bg-green-50"
                          : item.userAnswerLabel === null
                            ? "border-amber-200 bg-amber-50"
                            : "border-red-200 bg-red-50"
                      }`}
                    >
                      <p className="font-semibold">Câu {item.id} - {item.lessonTitle}</p>
                      <div
                        className="prose prose-sm mt-1 max-w-none"
                        dangerouslySetInnerHTML={{ __html: item.questionHtml }}
                      />
                      <p className="mt-1">
                        Bạn chọn:{" "}
                        {item.userAnswerLabel
                          ? `${item.userAnswerLabel}. ${item.userAnswerText}`
                          : "Không chọn"}
                      </p>
                      <p className="font-medium">
                        Đáp án đúng: {item.correctDisplayLabel}. {item.correctAnswerText}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={allPacksOpen} onOpenChange={setAllPacksOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-2xl rounded-2xl p-4 sm:p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-violet-800 sm:text-xl">
              Tất cả bộ đề môn Tin học
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 sm:text-sm">
              Chọn một bộ đề để vào thi nhanh. Mỗi bộ đề sẽ tự đảo câu hỏi và đáp án.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {tinLessonPacks.map((pack) => (
              <div
                key={`pack-${pack.lesson}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    Bài {pack.lesson} - {pack.title}
                  </p>
                  <p className="text-xs text-slate-500">{pack.count} câu hỏi</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleStartPackExam(pack)}
                >
                  Thi bộ này
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MockExamSubjectPage;
