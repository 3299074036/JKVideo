import { create } from "zustand";

interface VisibleBigKeyState {
  key: string | null;
  setKey: (key: string | null) => void;
}

export const useVisibleBigKeyStore = create<VisibleBigKeyState>((set) => ({
  key: null,
  setKey: (key) => set({ key }),
}));
