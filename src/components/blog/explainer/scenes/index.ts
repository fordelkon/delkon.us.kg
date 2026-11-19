import { scene as atomicPublication } from "./atomic-publication.ts";
import { scene as awaitState } from "./await-state.ts";
import { scene as deadlock } from "./deadlock.ts";
import { scene as diagnosticStages } from "./diagnostic-stages.ts";
import { scene as dnsCacheDoh } from "./dns-cache-doh.ts";
import { scene as lanArpDelivery } from "./lan-arp-delivery.ts";
import { scene as mutexCounter } from "./mutex-counter.ts";
import { scene as packetJourney } from "./packet-journey.ts";
import { scene as proxyTunFakeip } from "./proxy-tun-fakeip.ts";
import { scene as recursionStack } from "./recursion-stack.ts";
import { scene as routingNaptTun } from "./routing-napt-tun.ts";
import { scene as scheduling } from "./scheduling.ts";
import { scene as socketBufferEof } from "./socket-buffer-eof.ts";
import { scene as tlsHandshakeVisibility } from "./tls-handshake-visibility.ts";
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, NODE_HEIGHT, type Scene } from "./types.ts";
import { scene as workerPool } from "./worker-pool.ts";

const scenes = {
	scheduling,
	"mutex-counter": mutexCounter,
	"atomic-publication": atomicPublication,
	deadlock,
	"worker-pool": workerPool,
	"await-state": awaitState,
	"recursion-stack": recursionStack,
	"packet-journey": packetJourney,
	"lan-arp-delivery": lanArpDelivery,
	"routing-napt-tun": routingNaptTun,
	"socket-buffer-eof": socketBufferEof,
	"dns-cache-doh": dnsCacheDoh,
	"tls-handshake-visibility": tlsHandshakeVisibility,
	"proxy-tun-fakeip": proxyTunFakeip,
	"diagnostic-stages": diagnosticStages,
};

export type SceneId = keyof typeof scenes;

function validateScene(scene: Scene, id: string) {
	for (const chapter of scene.chapters ?? []) validateScene(chapter, id);

	if (!scene.frames.length) throw new Error(`Empty scene: ${id}`);

	for (const frame of scene.frames) {
		const ids = frame.boxes.map((node) => node.id);

		if (new Set(ids).size !== ids.length || !frame.note) throw new Error(`Invalid frame: ${id}`);

		for (const node of frame.boxes) {
			if (
				node.x < 0 ||
				node.y < 0 ||
				node.x + node.width > DIAGRAM_WIDTH ||
				node.y + NODE_HEIGHT > (scene.diagramHeight ?? DIAGRAM_HEIGHT) ||
				node.lines.length !== 2
			)
				throw new Error(`Invalid box ${node.id}: ${id}`);
		}
	}
}

export function getScene(id: SceneId): Scene {
	const scene = scenes[id];
	validateScene(scene, id);

	return scene;
}
