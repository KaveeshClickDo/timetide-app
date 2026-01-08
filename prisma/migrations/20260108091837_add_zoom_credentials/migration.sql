-- CreateTable
CREATE TABLE "ZoomCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "zoomUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoomCredential_userId_key" ON "ZoomCredential"("userId");

-- CreateIndex
CREATE INDEX "ZoomCredential_userId_idx" ON "ZoomCredential"("userId");

-- AddForeignKey
ALTER TABLE "ZoomCredential" ADD CONSTRAINT "ZoomCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
