-- AlterTable: two-factor sign-in (TOTP) on the user account.
-- The seed lives in the three cipher/iv/tag columns, sealed with AES-256-GCM
-- under PASSWORD_VAULT_KEY. Existing accounts start with 2FA off and no seed,
-- so nobody is locked out by this migration.
ALTER TABLE "User" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorCipher" TEXT,
ADD COLUMN     "twoFactorIv" TEXT,
ADD COLUMN     "twoFactorTag" TEXT;
