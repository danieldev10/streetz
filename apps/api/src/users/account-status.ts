import { AccountStatus } from "@prisma/client";

export type AccountStatusSnapshot = {
  accountStatus: AccountStatus;
  suspendedUntil: Date | null;
};

export function getAccountAccessBlock(user: AccountStatusSnapshot, now = new Date()) {
  if (user.accountStatus === AccountStatus.DELETED) {
    return "This account has been deleted.";
  }

  if (user.accountStatus === AccountStatus.BANNED) {
    return "This account is locked.";
  }

  if (user.accountStatus === AccountStatus.DEACTIVATED) {
    return "Reactivate your account to continue.";
  }

  if (user.accountStatus === AccountStatus.SUSPENDED && (!user.suspendedUntil || user.suspendedUntil > now)) {
    return "This account is temporarily suspended.";
  }

  return null;
}
