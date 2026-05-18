import { BRAND } from "../common/brand.js";

export interface AppWindowOptions {
  width: number;
  height: number;
  title: string;
}

export function createMainWindowOptions(): AppWindowOptions {
  return {
    width: 1440,
    height: 960,
    title: BRAND.bilingualName
  };
}
