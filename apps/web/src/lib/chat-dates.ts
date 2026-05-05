type MessageWithTimestamp = {
  id: string;
  createdAt: string;
};

export type DatedMessageItem<TMessage extends MessageWithTimestamp> =
  | {
      type: "date";
      key: string;
      label: string;
    }
  | {
      type: "message";
      key: string;
      message: TMessage;
    };

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getChatDateLabel(value: string, now = new Date()) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const dayDifference = Math.round((getLocalDayStart(now) - getLocalDayStart(date)) / DAY_IN_MS);

  if (dayDifference === 0) {
    return "Today";
  }

  if (dayDifference === 1) {
    return "Yesterday";
  }

  if (dayDifference > 1 && dayDifference < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function buildDatedMessageItems<TMessage extends MessageWithTimestamp>(
  messages: TMessage[]
): Array<DatedMessageItem<TMessage>> {
  const items: Array<DatedMessageItem<TMessage>> = [];
  let previousDayKey: string | null = null;

  for (const message of messages) {
    const date = new Date(message.createdAt);
    const dayKey = Number.isNaN(date.getTime()) ? "unknown-date" : getLocalDayKey(date);

    if (dayKey !== previousDayKey) {
      items.push({
        type: "date",
        key: `date-${dayKey}`,
        label: getChatDateLabel(message.createdAt),
      });
      previousDayKey = dayKey;
    }

    items.push({
      type: "message",
      key: message.id,
      message,
    });
  }

  return items;
}
