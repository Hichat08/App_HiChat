import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RelationshipRequest, User } from "@/types/user";
import { userService } from "@/services/userService";
import { useAuthStore } from "@/stores/useAuthStore";
import { friendService } from "@/services/friendService";

type Props = {
  userInfo: User;
};

const ProfilePersonalInfoInlineForm = ({ userInfo }: Props) => {
  const { setUser, user: me } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [searchingPartner, setSearchingPartner] = useState(false);
  const [relationshipKeyword, setRelationshipKeyword] = useState("");
  const [relationshipResults, setRelationshipResults] = useState<User[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<User | null>(null);
  const [receivedRequests, setReceivedRequests] = useState<RelationshipRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<RelationshipRequest[]>([]);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [requestingRelationship, setRequestingRelationship] = useState(false);
  const [formState, setFormState] = useState({
    currentCity: "",
    hometown: "",
    birthday: "",
    relationshipStatus: "" as "" | "single" | "in_relationship" | "married",
  });

  useEffect(() => {
    setFormState({
      currentCity: userInfo.currentCity ?? "",
      hometown: userInfo.hometown ?? "",
      birthday: userInfo.birthday ? new Date(userInfo.birthday).toISOString().slice(0, 10) : "",
      relationshipStatus: userInfo.relationshipStatus ?? "",
    });
  }, [userInfo]);

  const loadRelationshipRequests = async () => {
    try {
      const result = await userService.getRelationshipRequests();
      setReceivedRequests(result.received || []);
      setSentRequests(result.sent || []);
    } catch (error) {
      setReceivedRequests([]);
      setSentRequests([]);
    }
  };

  useEffect(() => {
    loadRelationshipRequests();
  }, []);

  const normalizedRelationshipKeyword = relationshipKeyword.trim();

  useEffect(() => {
    if (
      formState.relationshipStatus !== "in_relationship" ||
      userInfo.relationshipPartner ||
      normalizedRelationshipKeyword.length < 2
    ) {
      setRelationshipResults([]);
      return;
    }

    let alive = true;
    const timer = setTimeout(async () => {
      try {
        setSearchingPartner(true);
        const found = await friendService.searchUsers(normalizedRelationshipKeyword);
        if (!alive) return;
        setRelationshipResults((found || []).filter((item: User) => item?._id && item._id !== me?._id));
      } catch (error) {
        if (!alive) return;
        setRelationshipResults([]);
      } finally {
        if (alive) setSearchingPartner(false);
      }
    }, 300);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [formState.relationshipStatus, normalizedRelationshipKeyword, userInfo.relationshipPartner, me?._id]);

  const sortedRelationshipResults = useMemo(() => {
    if (!relationshipResults.length) return [];
    return [...relationshipResults].sort((a, b) => {
      const aSelected = selectedPartner?._id === a._id ? 1 : 0;
      const bSelected = selectedPartner?._id === b._id ? 1 : 0;
      return bSelected - aSelected;
    });
  }, [relationshipResults, selectedPartner?._id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const isChoosingRelationship = formState.relationshipStatus === "in_relationship";
    const alreadyPartnered = !!userInfo.relationshipPartner?._id;

    if (isChoosingRelationship && !alreadyPartnered && !selectedPartner?._id) {
      toast.warning("Vui lòng chọn người bạn muốn hẹn hò");
      return;
    }

    try {
      setLoading(true);
      const profilePayload: Parameters<typeof userService.updateProfile>[0] = {
        currentCity: formState.currentCity,
        hometown: formState.hometown,
        birthday: formState.birthday,
      };

      if (formState.relationshipStatus !== "in_relationship") {
        profilePayload.relationshipStatus = formState.relationshipStatus;
      } else if (alreadyPartnered) {
        profilePayload.relationshipStatus = "in_relationship";
      }

      const { user, message } = await userService.updateProfile(profilePayload);

      // Keep auth store in sync when editing own profile.
      if (me?._id && user?._id && me._id === user._id) {
        setUser(user);
      }
      toast.success(message || "Đã cập nhật thông tin cá nhân");

      if (isChoosingRelationship && !alreadyPartnered && selectedPartner?._id) {
        try {
          setRequestingRelationship(true);
          const result = await userService.sendRelationshipRequest(selectedPartner._id);
          toast.success(result?.message || "Đã gửi lời mời hẹn hò");
          setRelationshipKeyword("");
          setRelationshipResults([]);
          await loadRelationshipRequests();
        } catch (error: any) {
          toast.error(error?.response?.data?.message || "Không thể gửi lời mời hẹn hò");
        } finally {
          setRequestingRelationship(false);
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể cập nhật thông tin cá nhân");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRelationshipRequest = async (requestId: string) => {
    try {
      setRespondingRequestId(requestId);
      const { user, message } = await userService.acceptRelationshipRequest(requestId);
      if (user) {
        setUser(user);
      }
      toast.success(message || "Đã đồng ý lời mời hẹn hò");
      await loadRelationshipRequests();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể đồng ý lời mời");
    } finally {
      setRespondingRequestId(null);
    }
  };

  const handleDeclineRelationshipRequest = async (requestId: string) => {
    try {
      setRespondingRequestId(requestId);
      const result = await userService.declineRelationshipRequest(requestId);
      toast.success(result?.message || "Đã từ chối lời mời hẹn hò");
      await loadRelationshipRequests();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể từ chối lời mời");
    } finally {
      setRespondingRequestId(null);
    }
  };

  return (
    <Card className="border-border/30">
      <CardHeader>
        <CardTitle>Sửa thông tin cá nhân</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-current-city">Sống ở</Label>
              <Input
                id="profile-current-city"
                value={formState.currentCity}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, currentCity: event.target.value }))
                }
                placeholder="Ví dụ: Sơn La"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-hometown">Quê quán</Label>
              <Input
                id="profile-hometown"
                value={formState.hometown}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, hometown: event.target.value }))
                }
                placeholder="Ví dụ: Mường La, Sơn La, Việt Nam"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-birthday">Ngày sinh</Label>
              <Input
                id="profile-birthday"
                type="date"
                value={formState.birthday}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, birthday: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-relationship">Tình trạng</Label>
              <select
                id="profile-relationship"
                value={formState.relationshipStatus}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    relationshipStatus: event.target.value as "" | "single" | "in_relationship" | "married",
                  }))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Chưa cập nhật</option>
                <option value="single">Độc thân</option>
                <option value="in_relationship">Đang hẹn hò</option>
                <option value="married">Đã kết hôn</option>
              </select>
            </div>
          </div>

          {formState.relationshipStatus === "in_relationship" && (
            <div className="space-y-3 rounded-xl border p-3">
              <div className="space-y-1">
                <Label>Chọn người muốn hẹn hò</Label>
                <p className="text-xs text-muted-foreground">
                  Nhập tối thiểu 2 ký tự để tìm theo tên hiển thị hoặc username.
                </p>
              </div>
              {userInfo.relationshipPartner ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  Bạn đang hẹn hò với <span className="font-semibold">{userInfo.relationshipPartner.displayName}</span>.
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Ví dụ: Nguyễn Văn A hoặc @username"
                      value={relationshipKeyword}
                      onChange={(event) => setRelationshipKeyword(event.target.value)}
                    />
                  </div>

                  {selectedPartner && (
                    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      <span>
                        Đã chọn: <span className="font-semibold">{selectedPartner.displayName}</span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setSelectedPartner(null)}
                        title="Bỏ chọn"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  )}

                  {searchingPartner && (
                    <p className="text-xs text-muted-foreground">Đang tìm người dùng...</p>
                  )}

                  {!searchingPartner && normalizedRelationshipKeyword.length > 0 && normalizedRelationshipKeyword.length < 2 && (
                    <p className="text-xs text-muted-foreground">Vui lòng nhập ít nhất 2 ký tự để bắt đầu tìm kiếm.</p>
                  )}

                  {!searchingPartner && normalizedRelationshipKeyword.length >= 2 && sortedRelationshipResults.length === 0 && (
                    <p className="text-xs text-muted-foreground">Không tìm thấy người phù hợp.</p>
                  )}

                  {sortedRelationshipResults.length > 0 && (
                    <div className="max-h-52 space-y-1 overflow-auto rounded-md border bg-background p-1">
                      {sortedRelationshipResults.map((user) => {
                        const isSelected = selectedPartner?._id === user._id;
                        return (
                          <button
                            key={user._id}
                            type="button"
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 ${isSelected ? "bg-muted" : ""}`}
                            onClick={() => setSelectedPartner(user)}
                          >
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
                              <AvatarFallback>{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{user.displayName}</p>
                              <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                            {isSelected && <Check className="size-4 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {receivedRequests.length > 0 && (
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-sm font-medium">Lời mời hẹn hò đang chờ</p>
              <div className="space-y-2">
                {receivedRequests.map((request) => (
                  <div
                    key={request._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-2"
                  >
                    <div className="text-sm">
                      <span className="font-medium">{request.from?.displayName || "Người dùng"}</span>
                      <span className="text-muted-foreground"> muốn hẹn hò với bạn</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={respondingRequestId === request._id}
                        onClick={() => handleDeclineRelationshipRequest(request._id)}
                      >
                        Từ chối
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={respondingRequestId === request._id}
                        onClick={() => handleAcceptRelationshipRequest(request._id)}
                      >
                        Đồng ý
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sentRequests.length > 0 && (
            <div className="space-y-1 rounded-xl border p-3">
              <p className="text-sm font-medium">Lời mời hẹn hò bạn đã gửi</p>
              {sentRequests.slice(0, 3).map((request) => (
                <p key={request._id} className="text-sm text-muted-foreground">
                  Đang chờ phản hồi từ {request.to?.displayName || "người dùng"}
                </p>
              ))}
            </div>
          )}

          <Button type="submit" disabled={loading || requestingRelationship}>
            {loading ? "Đang lưu..." : requestingRelationship ? "Đang gửi lời mời..." : "Lưu thay đổi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProfilePersonalInfoInlineForm;
