import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userService } from "@/services/userService";

type ExamModeKey =
  | "normal"
  | "mediumHard"
  | "hard"
  | "wrongOnly"
  | "custom"
  | "sprint15"
  | "lesson"
  | "python45";

type ExamMonitorRecord = {
  _id: string;
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

const modeLabel: Record<ExamModeKey, string> = {
  normal: "Bình thường",
  mediumHard: "Trung bình khó",
  hard: "Thi thử khó",
  wrongOnly: "Ôn câu sai",
  custom: "Tự chọn",
  sprint15: "Tăng tốc 15p",
  lesson: "Theo chủ đề",
  python45: "Python 45p",
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AdminExamMonitorPage = () => {
  const [records, setRecords] = useState<ExamMonitorRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");

  const loadRecords = async () => {
    try {
      const data = await userService.listAdminExamAttempts({
        limit: 1000,
        keyword: keyword.trim() || undefined,
        subjectId: subjectFilter,
        mode: modeFilter,
      });
      const parsed = (data?.attempts || []) as ExamMonitorRecord[];
      setRecords(parsed.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
    } catch (error) {
      console.error("load admin exam monitor failed", error);
      setRecords([]);
    }
  };

  useEffect(() => {
    void loadRecords();
    const interval = window.setInterval(loadRecords, 15000);
    const onCustomUpdate = () => {
      void loadRecords();
    };
    window.addEventListener("hichat-exam-monitor-updated", onCustomUpdate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("hichat-exam-monitor-updated", onCustomUpdate);
    };
  }, [keyword, subjectFilter, modeFilter]);

  const subjects = useMemo(
    () => Array.from(new Set(records.map((item) => `${item.subjectId}|${item.subjectName}`))),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return records.filter((item) => {
      const keywordOk =
        !q ||
        item.displayName.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        String(item.userId || "").toLowerCase().includes(q);
      const subjectOk = subjectFilter === "all" || item.subjectId === subjectFilter;
      const modeOk = modeFilter === "all" || item.mode === modeFilter;
      return keywordOk && subjectOk && modeOk;
    });
  }, [records, keyword, subjectFilter, modeFilter]);

  const summary = useMemo(() => {
    if (!filteredRecords.length) {
      return {
        attempts: 0,
        avgScore: 0,
        avgDuration: 0,
        uniqueUsers: 0,
      };
    }
    const attempts = filteredRecords.length;
    const scoreSum = filteredRecords.reduce((acc, item) => acc + item.score, 0);
    const durationSum = filteredRecords.reduce((acc, item) => acc + item.durationMinutes, 0);
    const uniqueUsers = new Set(filteredRecords.map((item) => item.userId)).size;
    return {
      attempts,
      avgScore: Number((scoreSum / attempts).toFixed(2)),
      avgDuration: Number((durationSum / attempts).toFixed(1)),
      uniqueUsers,
    };
  }, [filteredRecords]);

  const topStudents = useMemo(() => {
    const map = new Map<string, { name: string; attempts: number; avg: number; total: number }>();
    filteredRecords.forEach((item) => {
      const key = item.userId;
      const current = map.get(key) || { name: item.displayName, attempts: 0, avg: 0, total: 0 };
      current.attempts += 1;
      current.total += item.score;
      current.avg = Number((current.total / current.attempts).toFixed(2));
      map.set(key, current);
    });
    return Array.from(map.values())
      .sort((a, b) => b.avg - a.avg || b.attempts - a.attempts)
      .slice(0, 8);
  }, [filteredRecords]);

  const weakLessons = useMemo(() => {
    const lessonMap = new Map<string, { total: number; correct: number }>();
    filteredRecords.forEach((record) => {
      Object.entries(record.lessonAccuracy || {}).forEach(([lesson, stat]) => {
        const current = lessonMap.get(lesson) || { total: 0, correct: 0 };
        current.total += stat.total;
        current.correct += stat.correct;
        lessonMap.set(lesson, current);
      });
    });
    return Array.from(lessonMap.entries())
      .map(([lesson, stat]) => ({
        lesson,
        ratio: stat.total > 0 ? Number(((stat.correct / stat.total) * 100).toFixed(1)) : 0,
        total: stat.total,
      }))
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 8);
  }, [filteredRecords]);

  return (
    <div className="min-h-screen bg-gradient-purple">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link to="/admin">
                <ArrowLeft className="size-4" />
                Admin
              </Link>
            </Button>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <ShieldCheck className="size-3.5" />
              Giám sát thi thử
            </div>
          </div>
          <Button type="button" variant="outline" onClick={loadRecords} className="rounded-lg">
            <RefreshCw className="size-4" />
            Tải lại
          </Button>
        </div>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Lượt thi</p>
            <p className="text-2xl font-bold text-foreground">{summary.attempts}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Điểm trung bình</p>
            <p className="text-2xl font-bold text-foreground">{summary.avgScore}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Thời gian TB</p>
            <p className="text-2xl font-bold text-foreground">{summary.avgDuration} phút</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Học sinh hoạt động</p>
            <p className="text-2xl font-bold text-foreground">{summary.uniqueUsers}</p>
          </div>
        </section>

        <section className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[1fr_auto_auto]">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm theo tên, username hoặc userId"
            className="h-10"
          />
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Tất cả môn</option>
            {subjects.map((item) => {
              const [id, name] = item.split("|");
              return (
                <option key={`subject-${id}`} value={id}>
                  {name}
                </option>
              );
            })}
          </select>
          <select
            value={modeFilter}
            onChange={(event) => setModeFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Tất cả chế độ</option>
            {Object.entries(modeLabel).map(([id, label]) => (
              <option key={`mode-${id}`} value={id}>
                {label}
              </option>
            ))}
          </select>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-sm font-semibold text-foreground">Lịch sử nộp bài gần nhất</p>
            <div className="max-h-[58vh] overflow-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Thời gian</th>
                    <th className="px-3 py-2">Học sinh</th>
                    <th className="px-3 py-2">Môn</th>
                    <th className="px-3 py-2">Chế độ</th>
                    <th className="px-3 py-2">Điểm</th>
                    <th className="px-3 py-2">Đúng/Tổng</th>
                    <th className="px-3 py-2">Phút</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((item) => (
                    <tr key={item._id} className="border-t border-border/60">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{item.displayName}</p>
                        <p className="text-xs text-muted-foreground">@{item.username}</p>
                      </td>
                      <td className="px-3 py-2">{item.subjectName}</td>
                      <td className="px-3 py-2">{modeLabel[item.mode] || item.mode}</td>
                      <td className="px-3 py-2 font-semibold text-foreground">{item.score.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {item.correct}/{item.total}
                      </td>
                      <td className="px-3 py-2">{item.durationMinutes}</td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        Chưa có dữ liệu thi để giám sát.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-semibold text-foreground">Top học sinh</p>
              <div className="space-y-2">
                {topStudents.map((item, idx) => (
                  <div key={`top-student-${idx + 1}`} className="rounded-lg border border-border/70 p-2">
                    <p className="text-sm font-medium text-foreground">
                      #{idx + 1} {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Điểm TB {item.avg} | {item.attempts} lượt thi
                    </p>
                  </div>
                ))}
                {topStudents.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có dữ liệu xếp hạng.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-semibold text-foreground">Chủ đề cần cải thiện</p>
              <div className="space-y-2">
                {weakLessons.map((item) => (
                  <div key={`weak-${item.lesson}`} className="rounded-lg border border-border/70 p-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">Bài {item.lesson}</span>
                      <span className="text-muted-foreground">{item.ratio}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          item.ratio >= 70 ? "bg-emerald-500" : item.ratio >= 50 ? "bg-warning" : "bg-destructive"
                        }`}
                        style={{ width: `${Math.max(5, item.ratio)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.total} câu đã làm</p>
                  </div>
                ))}
                {weakLessons.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa đủ dữ liệu theo chủ đề.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminExamMonitorPage;
