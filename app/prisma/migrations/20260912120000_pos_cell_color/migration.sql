-- A tile's background wash, purely visual — picked from the app's eight
-- categorical hues (the same ones charts use to tell series apart) so a bar
-- can group article tiles by eye. Nullable: null is the default panel
-- background, and every existing tile gets it for free.

-- CreateEnum
CREATE TYPE "PosCellColor" AS ENUM ('BLUE', 'ORANGE', 'TEAL', 'AMBER', 'PINK', 'GREEN', 'VIOLET', 'RED');

-- AlterTable
ALTER TABLE "PosTemplateCell" ADD COLUMN "color" "PosCellColor";
