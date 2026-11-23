-- CreateEnum
CREATE TYPE "BoardLane" AS ENUM ('TODO', 'IN_PROGRESS', 'AWAITING', 'DONE');

-- CreateTable
CREATE TABLE "EventBoard" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardCard" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "lane" "BoardLane" NOT NULL DEFAULT 'TODO',
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" "PosCellColor",
    "deadline" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardCardUser" (
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "BoardCardUser_pkey" PRIMARY KEY ("cardId","userId")
);

-- CreateTable
CREATE TABLE "BoardCardDepartment" (
    "cardId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "BoardCardDepartment_pkey" PRIMARY KEY ("cardId","departmentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventBoard_eventId_key" ON "EventBoard"("eventId");

-- CreateIndex
CREATE INDEX "BoardCard_boardId_lane_position_idx" ON "BoardCard"("boardId", "lane", "position");

-- CreateIndex
CREATE INDEX "BoardCardUser_userId_idx" ON "BoardCardUser"("userId");

-- CreateIndex
CREATE INDEX "BoardCardDepartment_departmentId_idx" ON "BoardCardDepartment"("departmentId");

-- AddForeignKey
ALTER TABLE "EventBoard" ADD CONSTRAINT "EventBoard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardCard" ADD CONSTRAINT "BoardCard_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "EventBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardCardUser" ADD CONSTRAINT "BoardCardUser_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardCardUser" ADD CONSTRAINT "BoardCardUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardCardDepartment" ADD CONSTRAINT "BoardCardDepartment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardCardDepartment" ADD CONSTRAINT "BoardCardDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

