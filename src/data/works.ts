import type { Work } from "@/components/work/WorksGrid.astro";
import micoIcon from "../../public/icons/mico.png";
import tauriEegIcon from "../../public/icons/tauri-eeg.png";

// Shared portfolio records rendered by WorksGrid on the home & about pages.
export const works: Work[] = [
	{
		href: "https://github.com/fordelkon/mico",
		name: "mico",
		summary: "Electron + React 桌面 AI 工作区，内置事件日志式 agent 运行时",
		icon: micoIcon,
	},
	{
		href: "https://github.com/fordelkon/tauri-eeg",
		name: "tauri-eeg",
		summary: "Tauri 2 + React 桌面应用，用于情绪诱发、音乐/视频调控与实验记录",
		icon: tauriEegIcon,
	},
];
