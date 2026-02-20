import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "../ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";

const baseSchema = {
  firstname: z.string().min(1, "Tên bắt buộc phải có"),
  lastname: z.string().min(1, "Họ bắt buộc phải có"),
  birthday: z.string().min(1, "Ngày tháng năm sinh bắt buộc phải có"),
  username: z.string().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
};

const signUpSchema = z.discriminatedUnion("registerType", [
  z.object({
    ...baseSchema,
    registerType: z.literal("phone"),
    phone: z
      .string()
      .min(9, "Số điện thoại không hợp lệ")
      .refine((value) => value.replace(/\D/g, "").length >= 9, {
        message: "Số điện thoại không hợp lệ",
      }),
    email: z.string().optional(),
  }),
  z.object({
    ...baseSchema,
    registerType: z.literal("email"),
    email: z.string().email("Email không hợp lệ"),
    phone: z.string().optional(),
  }),
]);

type SignUpFormValues = z.infer<typeof signUpSchema>;

export function SignupForm({ className, ...props }: React.ComponentProps<"div">) {
  const { signUp } = useAuthStore();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      registerType: "phone",
      firstname: "",
      lastname: "",
      birthday: "",
      username: "",
      password: "",
      phone: "",
      email: "",
    },
  });

  const registerType = watch("registerType");

  const onSubmit = async (data: SignUpFormValues) => {
    const { firstname, lastname, birthday, username, password } = data;
    const email = data.registerType === "email" ? data.email : "";
    const phone = data.registerType === "phone" ? data.phone : "";

    try {
      await signUp(username, password, email, firstname, lastname, phone, birthday);
      navigate("/signin");
    } catch {
      // giữ nguyên ở trang đăng ký khi đăng ký thất bại
    }
  };

  return (
    <div
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <Card className="overflow-hidden border-border p-0 shadow-soft">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="p-6 md:p-8"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="flex flex-col gap-5">
              {/* header - logo */}
              <div className="flex flex-col items-center text-center gap-2">
                <a
                  href="/"
                  className="mx-auto block w-fit text-center"
                >
                  <img
                    src="/logo.svg"
                    alt="logo"
                  />
                </a>

                <h1 className="text-2xl font-bold">Tạo tài khoản HiChat</h1>
              </div>

              <div className="grid grid-cols-2 rounded-xl bg-muted p-1.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
                    registerType === "phone"
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    setValue("registerType", "phone", { shouldValidate: true });
                    setValue("email", "");
                  }}
                >
                  Số điện thoại
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
                    registerType === "email"
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    setValue("registerType", "email", { shouldValidate: true });
                    setValue("phone", "");
                  }}
                >
                  Email
                </button>
              </div>

              {/* họ & tên */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="lastname"
                    className="block text-sm"
                  >
                    Họ
                  </Label>
                  <Input
                    type="text"
                    id="lastname"
                    {...register("lastname")}
                  />

                  {errors.lastname && (
                    <p className="text-destructive text-sm">{errors.lastname.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="firstname"
                    className="block text-sm"
                  >
                    Tên
                  </Label>
                  <Input
                    type="text"
                    id="firstname"
                    {...register("firstname")}
                  />
                  {errors.firstname && (
                    <p className="text-destructive text-sm">{errors.firstname.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="birthday"
                  className="block text-sm"
                >
                  Ngày tháng năm sinh
                </Label>
                <Input
                  type="date"
                  id="birthday"
                  max={new Date().toISOString().split("T")[0]}
                  {...register("birthday")}
                />
                {"birthday" in errors && errors.birthday && (
                  <p className="text-destructive text-sm">{errors.birthday.message}</p>
                )}
              </div>

              {/* username */}
              <div className="space-y-2">
                <Label
                  htmlFor="username"
                  className="block text-sm"
                >
                  Tên đăng nhập
                </Label>
                <Input
                  type="text"
                  id="username"
                  placeholder="hichat"
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-destructive text-sm">{errors.username.message}</p>
                )}
              </div>

              {registerType === "phone" ? (
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="block text-sm"
                  >
                    Số điện thoại
                  </Label>
                  <Input
                    type="tel"
                    id="phone"
                    placeholder="0901234567"
                    {...register("phone")}
                  />
                  {"phone" in errors && errors.phone && (
                    <p className="text-destructive text-sm">{errors.phone.message}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="block text-sm"
                  >
                    Email
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    placeholder="m@gmail.com"
                    {...register("email")}
                  />
                  {"email" in errors && errors.email && (
                    <p className="text-destructive text-sm">{errors.email.message}</p>
                  )}
                </div>
              )}

              {/* password */}
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="block text-sm"
                >
                  Mật khẩu
                </Label>
                <Input
                  type="password"
                  id="password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}
              </div>

              {/* nút đăng ký */}
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                Tạo tài khoản
              </Button>

              <div className="text-center text-sm">
                Đã có tài khoản?{" "}
                <a
                  href="/signin"
                  className="underline underline-offset-4"
                >
                  Đăng nhập
                </a>
              </div>
            </div>
          </form>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/placeholderSignUp.png"
              alt="Image"
              className="absolute top-1/2 -translate-y-1/2 object-cover"
            />
          </div>
        </CardContent>
      </Card>
      <div className="px-6 text-center text-xs text-balance text-muted-foreground *:[a]:underline *:[a]:underline-offset-4 *:[a]:hover:text-primary">
        Bằng cách tiếp tục, bạn đồng ý với <a href="#">Điều khoản dịch vụ</a> và{" "}
        <a href="#">Chính sách bảo mật</a> của chúng tôi.
      </div>
    </div>
  );
}
