export interface AppWindowOptions {
  width: number;
  height: number;
  title: string;
}

export function createMainWindowOptions(): AppWindowOptions {
  return {
    width: 1440,
    height: 960,
    title: "PolyAnswer Hub"
  };
}
