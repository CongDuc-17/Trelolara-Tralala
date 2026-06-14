import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar, Camera, Mail, MapPin } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Spinner } from "@/components/ui/spinner";
import { useUserStore } from "@/stores/user.store";
import { ChangePassword } from "@/components/user/ChangePassword";

export function Profile() {
  const { user, getMyInformation } = useUserStore();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setAddress(user.address || "");
      setBio(user.bio || "");
    }
  }, [user]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      // Tạo URL tạm thời để hiển thị ảnh ngay lập tức
      setPreviewUrl(URL.createObjectURL(file));
      // Tự động bật chế độ editing khi user chọn ảnh
      setEditing(true);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    if (user) {
      setName(user.name || "");
      setAddress(user.address || "");
      setBio(user.bio || "");
    }
    setAvatarFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl); // Giải phóng bộ nhớ
      setPreviewUrl(null);
    }
  };

  const handleEditProfile = async () => {
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("address", address);
      formData.append("bio", bio);
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const response = await apiClient.put("/users/me", formData);

      await getMyInformation();
      setEditing(false);
      setAvatarFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } catch (error: any) {
      console.error(
        "Error updating profile:",
        error.response?.data?.message || error.message,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-8/12 mx-auto mt-10">
      <Card className="flex flex-row justify-between items-center p-6">
        <div className="flex items-center gap-6">
          <div className="relative">
            <Avatar className="w-30 h-30">
              <AvatarImage
                src={
                  previewUrl ||
                  user?.avatar ||
                  "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                }
                alt="User Avatar"
                className="object-cover "
              />
              <AvatarFallback>
                {user?.name?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <Camera
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full p-1 border border-gray-300 hover:bg-gray-100 cursor-pointer"
              size={24}
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="font-bold text-3xl">{user?.name}</div>

            <Badge className="bg-green-50 px-8 text-md text-green-700 dark:bg-green-950 dark:text-green-300">
              Active
            </Badge>
            <div className="flex gap-3 text-gray-600">
              <div className="flex items-center gap-1">
                <Mail size={16} />
                {user?.email}
              </div>
              <div className="flex items-center gap-1">
                {" "}
                <MapPin size={16} />
                {user?.address}
              </div>
              <div className="flex items-center gap-1">
                <Calendar size={16} />
                Joined at{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "N/A"}
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={() => {
            setEditing(true);
          }}
        >
          Edit Profile
        </Button>
      </Card>

      <Tabs defaultValue="personal" className="w-full mt-8">
        <TabsList className="w-full">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  Update your personal details and profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div className="grid grid-cols-2 gap-4 text-black">
                  <div>
                    Name
                    <Input
                      value={name}
                      disabled={!editing}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    Email
                    <Input value={user?.email} disabled={true} />
                  </div>

                  <div>
                    Address
                    <Input
                      value={address}
                      disabled={!editing}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>

                  <div>
                    Bio
                    <Textarea
                      value={bio}
                      disabled={!editing}
                      onChange={(e) => setBio(e.target.value)}
                    />
                  </div>
                </div>
                {editing && (
                  <div className="flex justify-end gap-2 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => handleCancel()}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleEditProfile()}
                      disabled={isLoading}
                    >
                      {isLoading && <Spinner data-icon="inline-start" />}
                      {isLoading ? "Submitting..." : "Submit"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="account" className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground flex justify-between items-center">
                <div>
                  <div className="text-black">Account Status</div>
                  <div>Your account is currently active</div>
                </div>

                <Badge className="bg-green-50 px-10 text-md font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  Active
                </Badge>
              </CardContent>
            </Card>
            <Card className="border-red-500">
              <CardHeader>
                <CardTitle className="text-red-500">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible and destructive actions
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground flex justify-between items-center">
                <div>
                  <div className="font-medium">Delete Account</div>
                  <div>
                    Once you delete your account, there is no going back.
                  </div>
                </div>
                <Button variant="destructive" className="hover:cursor-pointer">
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Manage your account security and authentication.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground flex justify-between items-center">
                <div>
                  <div className=" text-black">Change Password</div>
                  <div>
                    Update your password regularly to keep your account secure.
                  </div>
                </div>
                {/* <Button variant="outline" className="hover:cursor-pointer">
                  Change Password
                </Button> */}
                <ChangePassword />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground flex justify-between items-center">
                <div>
                  <div className=" text-black">Email Notifications</div>
                  <div>Receive notifications via email</div>
                </div>
                <Switch />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
