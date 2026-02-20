import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PreferencesForm from "@/components/profile/PreferencesForm";
import PrivacySettings from "@/components/profile/PrivacySettings";
import PersonalInfoForm from "@/components/profile/PersonalInfoForm";
import { useAuthStore } from "@/stores/useAuthStore";

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  return (
    <main className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 size-4" />
          Về trang chính
        </Button>

        <Tabs defaultValue="personal-info" className="my-4">
          <TabsList className="grid w-full grid-cols-3 glass-light">
            <TabsTrigger value="personal-info" className="data-[state=active]:glass-strong">
              Thông tin cá nhân
            </TabsTrigger>
            <TabsTrigger value="preferences" className="data-[state=active]:glass-strong">
              Cấu Hình
            </TabsTrigger>
            <TabsTrigger value="privacy" className="data-[state=active]:glass-strong">
              Bảo Mật
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal-info">
            <PersonalInfoForm userInfo={user} />
          </TabsContent>

          <TabsContent value="preferences">
            <PreferencesForm />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacySettings />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default SettingsPage;
