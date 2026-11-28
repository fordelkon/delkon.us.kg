import { label, mark } from "./examples.ts";
import type { Frame, Scene } from "./types.ts";

function ownership(cancelled: boolean): Frame {
	const future = (id: string, x: number, valueInside: boolean) => [
		...(cancelled
			? [label(`${id}-gone`, x + 83, 130, "分支已丢弃", 142)]
			: [
					mark(`${id}-future`, x + 10, 92, 146, 74, "", "cell"),
					label(`${id}-type`, x + 83, 108, "等待 Future", 138),
				]),
		...(valueInside && !cancelled ? [mark(`${id}-v`, x + 58, 127, 50, 28, "v", "cell", true)] : []),
	];

	return {
		note: cancelled
			? "取消分支先胜出。两个等待 Future 都被丢弃：左边的 v 随之析构，右边的 v 仍可取回重试。"
			: "通道已满，两种写法都在等待。send(v) 已经接管 v；reserve() 只等待容量，v 仍在外层。",
		boxes: [
			label("send-label", 92, 14, "send(v)", 164),
			label("reserve-label", 268, 14, "reserve()", 164),
			mark("send-outer", 8, 34, 168, 147, "", "cell"),
			mark("reserve-outer", 184, 34, 168, 147, "", "cell"),
			label("send-owner", 92, 66, "外层", 136),
			label("reserve-owner", 232, 66, "外层", 78),
			mark("reserve-value", 277, 50, 48, 32, "v", "cell", true),
			...future("send", 9, true),
			...future("reserve", 185, false),
		],
	};
}

export const scene: Scene = {
	title: "取消等待时谁还持有消息",
	diagramHeight: 190,
	caption:
		"取消这次等待时，send(v) 连同消息一起被丢弃。只预约容量的 reserve() 会失去排队位置，外层还拿着 v。",
	description:
		"Tokio 有界通道已满。send(v) 把消息移入发送 Future，reserve() 则把它留在外层。select! 的另一个分支获胜时，两个等待 Future 都被丢弃，只有 reserve 写法还能拿到原来的消息。",
	frames: [ownership(false), ownership(true)],
};
