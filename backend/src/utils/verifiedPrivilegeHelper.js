export const VERIFICATION_TIERS = ["none", "basic", "creator", "business"];

export const normalizeVerificationTier = (value) => {
  const text = (value || "").toString().trim().toLowerCase();
  if (text === "basic" || text === "creator" || text === "business") return text;
  return "none";
};

export const getVerifiedPrivilegeSnapshot = (user = {}) => {
  const isVerified = !!user?.isVerified;
  const tier = isVerified ? normalizeVerificationTier(user?.verificationTier) : "none";

  const base = {
    isVerified,
    tier,
    securityShield: false,
    prioritySearch: false,
    algorithmBoost: false,
    storyBoost: false,
    dmBypassSpam: false,
    canMessageNonFriends: false,
    profileThemes: false,
    websiteLink: false,
    customCreatorBadge: false,
    analytics: false,
    scheduledPosts: false,
    prioritySupport: false,
    monetization: false,
    businessTools: false,
  };

  if (!isVerified || tier === "none") return base;

  const withBasic = {
    ...base,
    securityShield: true,
    prioritySearch: true,
    algorithmBoost: true,
    storyBoost: true,
    dmBypassSpam: true,
    canMessageNonFriends: true,
    profileThemes: true,
    websiteLink: true,
    prioritySupport: true,
  };

  if (tier === "basic") return withBasic;

  const withCreator = {
    ...withBasic,
    customCreatorBadge: true,
    analytics: true,
    scheduledPosts: true,
    monetization: true,
  };

  if (tier === "creator") return withCreator;

  return {
    ...withCreator,
    businessTools: true,
  };
};
