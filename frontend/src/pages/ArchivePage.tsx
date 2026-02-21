import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { archiveService } from "@/services/archiveService";
import type { ArchiveItem } from "@/types/archive";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2 } from "lucide-react";

const ArchivePage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await archiveService.getMyItems();
      setItems(data);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải kho lưu trữ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      toast.warning("Vui lòng nhập tiêu đề");
      return;
    }

    try {
      setCreating(true);
      const created = await archiveService.createItem({ title, content: newContent });
      setItems((prev) => [created, ...prev]);
      setNewTitle("");
      setNewContent("");
      toast.success("Đã thêm vào kho lưu trữ");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tạo mục lưu trữ");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      setDeletingId(itemId);
      await archiveService.deleteItem(itemId);
      setItems((prev) => prev.filter((item) => item._id !== itemId));
      toast.success("Đã xoá mục lưu trữ");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xoá mục lưu trữ");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-muted/40 p-3 sm:p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 size-4" />
          Về trang chính
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Kho lưu trữ cá nhân</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Tiêu đề mục lưu trữ"
            />
            <Textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="Nội dung (không bắt buộc)"
            />
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Đang lưu..." : "Thêm vào kho lưu trữ"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">Đang tải dữ liệu...</CardContent>
            </Card>
          ) : sortedItems.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Chưa có dữ liệu trong kho lưu trữ của bạn.
              </CardContent>
            </Card>
          ) : (
            sortedItems.map((item) => (
              <Card key={item._id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item._id)}
                      disabled={deletingId === item._id}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  {item.content ? <p className="whitespace-pre-wrap text-sm">{item.content}</p> : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </main>
  );
};

export default ArchivePage;
