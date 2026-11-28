import { label, mark } from "./examples.ts";
import type { Box, Frame, Scene } from "./types.ts";

const devices = ["二层交换机", "路由器 R", "终点主机 B"] as const;

type Device = (typeof devices)[number];

const connection = { client: "A", server: "B", clientPort: 51000, serverPort: 443 };
const initialTtl = 64;
const etherType = "0x0800";
const protocol = 6;

function observe(device: Device): Frame {
	const forwarded = device !== devices[0];
	const routing = device === devices[1];
	const delivered = device === devices[2];
	const sourceMac = forwarded ? "R 出口" : connection.client;
	const destinationMac = forwarded ? connection.server : "R 入口";
	const ttl = initialTtl - Number(forwarded);

	function field(
		id: string,
		column: number,
		row: number,
		rows: number,
		name: string,
		value: string,
		active = false,
	): Box {
		const height = 216 / rows;
		const box = mark(id, 4 + column * 88, 31 + row * height, 88, height, "", "cell", active);

		return { ...box, lines: [name, value] };
	}

	const tuple = `${connection.client}:${connection.clientPort} 与 ${connection.server}:${connection.serverPort}`;

	const notes: Record<Device, string> = {
		二层交换机: `帧的目的 MAC 是 ${destinationMac}。交换机按这个地址选择出端口，把帧交给路由器，TTL 仍为 ${ttl}。`,
		"路由器 R": `R 按目的 IP ${connection.server} 选路。出接口封装的新帧从 ${sourceMac} 发往 ${destinationMac}，TTL 从 ${initialTtl} 减到 ${ttl}，IPv4 头部校验和也随之更新。`,
		"终点主机 B": `B 按类型 ${etherType} 解析 IPv4，按协议号 ${protocol} 交给 TCP，再用 ${tuple} 匹配已建立的套接字。本例的字节按序到达，可以交付。`,
	};

	return {
		note: notes[device],
		boxes: [
			...["以太网", "IPv4", "TCP", "载荷"].map((name, column) =>
				label(`layer-${column}`, 48 + column * 88, 15, name, 84),
			),
			field("dst-mac", 0, 0, 3, "目的 MAC", destinationMac, !delivered),
			field("src-mac", 0, 1, 3, "源 MAC", sourceMac, routing),
			field("type", 0, 2, 3, "类型", etherType, delivered),
			field("src-ip", 1, 0, 4, "源 IP", connection.client),
			field("dst-ip", 1, 1, 4, "目的 IP", connection.server, routing),
			field("ttl", 1, 2, 4, "TTL", String(ttl), routing),
			field("protocol", 1, 3, 4, "协议号", String(protocol), delivered),
			field("src-port", 2, 0, 2, "源端口", String(connection.clientPort), delivered),
			field("dst-port", 2, 1, 2, "目的端口", String(connection.serverPort), delivered),
			field("payload", 3, 0, 1, "TLS", "字节", delivered),
			label("socket", 88, 273, "B 的接收缓冲区", 167),
			mark("received", 180, 256, 149, 34, delivered ? "TLS 字节" : "空", "cell", delivered),
		],
	};
}

export const scene: Scene = {
	title: "同一份数据，三台设备各读哪一层？",
	caption:
		"A 经交换机和路由器 R 向 B 发送 TCP 数据。两段链路均为以太网，无 NAT 或分片。每栏展开所选协议的部分字段。",
	description:
		"交换机按目的 MAC 转发。路由器按目的 IP 换上下一跳的以太网头并递减 TTL。终点按以太网类型和 IP 协议号解封装，再把 TCP 字节交给匹配的套接字。",
	diagramHeight: 298,
	control: { label: "观察位置", options: [...devices] },
	frames: devices.map(observe),
};
