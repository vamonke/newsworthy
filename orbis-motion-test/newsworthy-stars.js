export const STAR_THRESHOLDS=[1000,3500,6000];
export const starsFor=total=>STAR_THRESHOLDS.filter(threshold=>total>=threshold).length;
