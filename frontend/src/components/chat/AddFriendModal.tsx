import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { UserPlus } from "lucide-react";
import type { User } from "@/types/user";
import { useFriendStore } from "@/stores/useFriendStore";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import SearchForm from "@/components/AddFriendModal/SearchForm";
import SendFriendRequestForm from "@/components/AddFriendModal/SendFriendRequestForm";
import FriendSuggestions from "@/components/friendRequest/FriendSuggestions";
import { friendService } from "@/services/friendService";

export interface IFormValues {
  username: string;
  message: string;
}

const AddFriendModal = () => {
  const [isFound, setIsFound] = useState<boolean | null>(null);
  const [searchUser, setSearchUser] = useState<User>();
  const [searchedUsername, setSearchedUsername] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const { loading, addFriend } = useFriendStore();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<IFormValues>({
    defaultValues: { username: "", message: "" },
  });

  const usernameValue = watch("username");
  const normalizedKeyword = useMemo(
    () => usernameValue?.toString().trim().toLowerCase() || "",
    [usernameValue]
  );

  useEffect(() => {
    let alive = true;
    const keyword = usernameValue?.toString().trim() || "";
    if (!keyword) {
      setSearchResults([]);
      setIsFound(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const users = await friendService.searchUsers(keyword);
        if (!alive) return;
        setSearchResults(users || []);
      } catch (error) {
        if (!alive) return;
        setSearchResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 220);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [usernameValue]);

  const handleSearch = handleSubmit(async (data) => {
    const keyword = data.username.trim();
    if (!keyword) return;

    setIsFound(null);
    setSearchedUsername(keyword);

    try {
      const foundUser =
        searchResults.find((item) => {
          const displayName = item.displayName?.toString().trim().toLowerCase() || "";
          const username = item.username?.toString().trim().toLowerCase() || "";
          return displayName === normalizedKeyword || username === normalizedKeyword;
        }) || searchResults[0];

      if (foundUser) {
        setIsFound(true);
        setSearchUser(foundUser);
      } else {
        setIsFound(false);
      }
    } catch (error) {
      console.error(error);
      setIsFound(false);
    }
  });

  const handleSend = handleSubmit(async (data) => {
    if (!searchUser) return;

    try {
      const message = await addFriend(searchUser._id, data.message.trim());
      toast.success(message);

      handleCancel();
    } catch (error) {
      console.error("Lỗi xảy ra khi gửi request từ form", error);
    }
  });

  const handleCancel = () => {
    reset();
    setSearchedUsername("");
    setIsFound(null);
    setSearchResults([]);
  };

  const handleSelectUser = (user: User) => {
    setSearchUser(user);
    setIsFound(true);
    setSearchedUsername(user.displayName || user.username || "");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex justify-center items-center size-5 rounded-full hover:bg-sidebar-accent cursor-pointer z-10">
          <UserPlus className="size-4" />
          <span className="sr-only">Kết bạn</span>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] border-none">
        <DialogHeader>
          <DialogTitle>Kết Bạn</DialogTitle>
        </DialogHeader>

        {!isFound && (
          <>
            {/* suggestions (smart) shown above search */}
            <FriendSuggestions />

            <SearchForm
              register={register}
              errors={errors}
              usernameValue={usernameValue}
              loading={loading}
              isFound={isFound}
              searchedUsername={searchedUsername}
              searchResults={searchResults}
              onSelectUser={handleSelectUser}
              onSubmit={handleSearch}
              onCancel={handleCancel}
            />
          </>
        )}

        {isFound && (
          <>
            <SendFriendRequestForm
              register={register}
              loading={loading}
              searchedUsername={searchedUsername}
              onSubmit={handleSend}
              onBack={() => setIsFound(null)}
            />
          </>
        )}
        {(searching || loading) && (
          <p className="px-1 text-xs text-muted-foreground">Đang tìm...</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendModal;
