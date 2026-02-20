import { useUserStore } from "@/stores/useUserStore";
import { useRef } from "react";
import { Button } from "../ui/button";
import { Camera } from "lucide-react";

const AvatarUploader = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateAvatarUrl } = useUserStore();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();

    formData.append("file", file);

    await updateAvatarUrl(formData);
  };

  return (
    <>
      <Button
        size="icon"
        variant="secondary"
        onClick={handleClick}
        className="absolute -bottom-1 -right-1 z-20 size-10 rounded-full border-2 border-background shadow-md transition duration-300 hover:scale-110 hover:bg-background"
      >
        <Camera className="size-4" />
      </Button>

      <input
        type="file"
        hidden
        accept="image/*"
        ref={fileInputRef}
        onChange={handleUpload}
      />
    </>
  );
};

export default AvatarUploader;
