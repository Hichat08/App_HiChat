import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IFormValues } from "../chat/AddFriendModal";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { DialogFooter } from "../ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import { Search } from "lucide-react";
import type { User } from "@/types/user";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

interface SearchFormProps {
  register: UseFormRegister<IFormValues>;
  errors: FieldErrors<IFormValues>;
  loading: boolean;
  usernameValue: string;
  isFound: boolean | null;
  searchedUsername: string;
  searchResults: User[];
  onSelectUser: (user: User) => void;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

const SearchForm = ({
  register,
  errors,
  usernameValue,
  loading,
  isFound,
  searchedUsername,
  searchResults,
  onSelectUser,
  onSubmit,
  onCancel,
}: SearchFormProps) => {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label
          htmlFor="username"
          className="text-sm font-semibold"
        >
          Tìm bằng tên hiển thị, username hoặc số điện thoại
        </Label>

        <Input
          id="username"
          placeholder="Ví dụ: u, user hai, 0395..."
          className="glass border-border/50 focus:border-primary/50 transition-smooth"
          {...register("username", {
            required: "Vui lòng nhập từ khoá tìm kiếm",
          })}
        ></Input>
        {errors.username && (
          <p className="error-message">{errors.username.message}</p>
        )}

        {isFound === false && (
          <span className="error-message">
            Người dùng chưa tồn tại hoặc đã sai tên:{" "}
            <span className="font-semibold">{searchedUsername}</span>
          </span>
        )}

        {searchResults.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-md border bg-background">
            {searchResults.map((user) => (
              <button
                key={user._id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                onClick={() => onSelectUser(user)}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
                  <AvatarFallback>{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.displayName || "Người dùng"}</p>
                  <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            className="flex-1 glass hover:text-destructive"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </DialogClose>

        <Button
          type="submit"
          disabled={loading || !usernameValue?.trim()}
          className="flex-1 bg-gradient-chat text-white hover:opacity-90 transition-smooth"
        >
          {loading ? (
            <span>Đang tìm ...</span>
          ) : (
            <>
              <Search className="size-4 mr-2" /> Tìm
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default SearchForm;
