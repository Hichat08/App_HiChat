import { useNavigate } from "react-router";
import { ArrowLeft, BookOpenCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const subjects = [
  { key: "tin", label: "Tin học", ready: true },
  { key: "toan", label: "Toán", ready: false },
  { key: "van", label: "Văn", ready: false },
  { key: "su", label: "Sử", ready: false },
  { key: "cong-nghe", label: "Công nghệ", ready: false },
  { key: "ly", label: "Lý", ready: false },
  { key: "hoa", label: "Hoá", ready: false },
  { key: "ktpl", label: "KTPL", ready: false },
  { key: "tieng-anh", label: "Tiếng Anh", ready: false },
];

const MockExam12Page = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#f8fafc_50%,#eef2ff_100%)]">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-3 sm:px-4 sm:py-5">
        <div className="rounded-2xl border border-white/60 bg-white/80 p-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#6d28d9_0%,#7c3aed_45%,#c026d3_100%)] px-3 py-2.5 text-primary-foreground">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
              onClick={() => navigate("/")}
              title="Quay về Trang chủ"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Khu luyện thi</p>
              <div className="flex items-center gap-2">
                <BookOpenCheck className="size-4" />
                <h1 className="text-base font-bold">Luyện thi thử 12</h1>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-violet-100 bg-white/90 shadow-[0_20px_50px_-35px_rgba(91,33,182,0.7)]">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-800">Chọn môn muốn thi thử</p>
                <p className="text-sm text-slate-500">
                  Môn có nhãn sẵn sàng có thể thi ngay, các môn khác sẽ cập nhật dần.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                <Sparkles className="size-3.5" />
                Đề mới
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {subjects.map((subject) => (
                <button
                  key={subject.key}
                  type="button"
                  onClick={() => navigate(`/mock-exam-12/${subject.key}`)}
                  className={`rounded-xl border px-3 py-3 text-left transition-all ${
                    subject.ready
                      ? "border-violet-200 bg-[linear-gradient(160deg,#f5f3ff_0%,#ede9fe_100%)] hover:border-violet-300 hover:shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      subject.ready ? "text-violet-800" : "text-slate-700"
                    }`}
                  >
                    {subject.label}
                  </p>
                  <p
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      subject.ready
                        ? "bg-violet-200/70 text-violet-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {subject.ready ? "Sẵn sàng" : "Đang cập nhật"}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MockExam12Page;
