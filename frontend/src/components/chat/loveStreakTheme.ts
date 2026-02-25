export type LoveStreakTierKey =
  | "pink"
  | "red"
  | "purple"
  | "blue"
  | "gold"
  | "galaxy"
  | "rainbow";

export type LoveStreakPalette = {
  sent: string;
  sentForeground: string;
  received: string;
  receivedForeground: string;
};

export const isLoveStreakMode = (modeType?: string | null) =>
  modeType === "love" || modeType === "dating";

export const getLoveStreakTierKey = (count: number): LoveStreakTierKey => {
  if (count >= 1000) return "rainbow";
  if (count >= 700) return "galaxy";
  if (count >= 365) return "gold";
  if (count >= 180) return "blue";
  if (count >= 100) return "purple";
  if (count >= 45) return "red";
  if (count >= 14) return "pink";
  return "pink";
};

export const getLoveStreakPaletteByCount = (count: number): LoveStreakPalette => {
  const tier = getLoveStreakTierKey(count);

  if (tier === "rainbow") {
    return {
      sent: "278 84% 58%",
      sentForeground: "0 0% 100%",
      received: "284 90% 98%",
      receivedForeground: "276 40% 24%",
    };
  }

  if (tier === "galaxy") {
    return {
      sent: "248 82% 60%",
      sentForeground: "0 0% 100%",
      received: "236 70% 97%",
      receivedForeground: "240 38% 23%",
    };
  }

  if (tier === "gold") {
    return {
      sent: "43 96% 52%",
      sentForeground: "21 45% 20%",
      received: "50 100% 96%",
      receivedForeground: "35 52% 22%",
    };
  }

  if (tier === "blue") {
    return {
      sent: "214 90% 53%",
      sentForeground: "0 0% 100%",
      received: "214 95% 97%",
      receivedForeground: "216 40% 24%",
    };
  }

  if (tier === "purple") {
    return {
      sent: "267 78% 56%",
      sentForeground: "0 0% 100%",
      received: "270 100% 97%",
      receivedForeground: "272 36% 24%",
    };
  }

  if (tier === "red") {
    return {
      sent: "352 84% 56%",
      sentForeground: "0 0% 100%",
      received: "351 100% 97%",
      receivedForeground: "352 36% 24%",
    };
  }

  return {
    sent: "336 84% 57%",
    sentForeground: "0 0% 100%",
    received: "336 100% 97%",
    receivedForeground: "336 40% 20%",
  };
};
