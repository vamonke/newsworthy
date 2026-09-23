export const STAR_THRESHOLDS=[1000,3500,6000];
export const starsFor=total=>STAR_THRESHOLDS.filter(threshold=>total>=threshold).length;
export function starMessage(total){const stars=starsFor(total);return stars===3?'Three-star round!':'$'+(STAR_THRESHOLDS[stars]-total).toLocaleString()+' to your '+['first','second','third'][stars]+' star';}
