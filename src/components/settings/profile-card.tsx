'use client'

import { useRef } from 'react'
import {
  User,
  Loader2,
  Check,
  AlertCircle,
  Camera,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface ProfileCardProps {
  userImage: string | null | undefined
  userName: string | null | undefined
  formData: { name: string; username: string; bio: string }
  setFormData: (updater: (prev: any) => any) => void
  usernameAvailable: boolean | null
  checkingUsername: boolean
  avatarUploading: boolean
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function ProfileCard({
  userImage,
  userName,
  formData,
  setFormData,
  usernameAvailable,
  checkingUsername,
  avatarUploading,
  onAvatarChange,
}: ProfileCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile
        </CardTitle>
        <CardDescription>
          Your public profile information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onAvatarChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="relative group"
          >
            <Avatar className="h-20 w-20">
              <AvatarImage src={userImage || undefined} />
              <AvatarFallback className="text-xl">
                {userName ? getInitials(userName) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {avatarUploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
            >
              {avatarUploading ? 'Uploading...' : 'Change photo'}
            </Button>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, WebP or GIF. Max 2MB.
            </p>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, name: e.target.value }))}
            placeholder="Your name"
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm sm:text-base">
              timetide.app/
            </span>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) =>
                setFormData((prev: any) => ({
                  ...prev,
                  username: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                }))
              }
              className="pl-[6.5rem] sm:pl-28"
              placeholder="username"
            />
            {checkingUsername && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
            )}
            {!checkingUsername && usernameAvailable === true && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
            {!checkingUsername && usernameAvailable === false && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            )}
          </div>
          {usernameAvailable === false && (
            <p className="text-sm text-red-500">This username is already taken</p>
          )}
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <textarea
            id="bio"
            value={formData.bio}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, bio: e.target.value }))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
            placeholder="A short description about yourself..."
          />
        </div>
      </CardContent>
    </Card>
  )
}
