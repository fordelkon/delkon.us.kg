import { type D3DragEvent, drag } from "d3-drag";
import {
	forceCollide,
	forceLink,
	forceSimulation,
	forceX,
	forceY,
	type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";

interface GraphNode extends SimulationNodeDatum {
	element: SVGGraphicsElement;
	x: number;
	y: number;
	homeX: number;
	homeY: number;
	dragMotion?: DragMotion;
}

interface DragMotion {
	time: number;
	vx: number;
	vy: number;
}

interface GraphLink {
	line: SVGLineElement;
	source: GraphNode;
	target: GraphNode;
	restLength: number;
}

const nodePadding = 10;
const entranceAlpha = 0.7;
const entranceImpulse = 5;
const dragAlpha = 0.55;
const tickInterval = 1000 / 120;
const maxTicksPerFrame = 4;

function keepInside(position: number, size: number) {
	return Math.max(nodePadding, Math.min(size - nodePadding, position));
}

export class PostLinkGraph extends HTMLElement {
	#disconnect: (() => void) | undefined;

	activate() {
		const graph = this.querySelector("svg");
		const label = this.querySelector("[data-graph-label]");

		if (!graph || !label || this.#disconnect) return;

		const currentTitle = label.textContent;
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const { width, height } = graph.viewBox.baseVal;

		const nodes = select(graph)
			.selectAll<SVGGraphicsElement, GraphNode>("[data-node]")
			.datum(function (): GraphNode {
				const x = Number(this.dataset.x);
				const y = Number(this.dataset.y);

				return { element: this, x, y, homeX: x, homeY: y };
			});

		const graphNodes = nodes.data();
		const nodesById = new Map(graphNodes.map((node) => [node.element.dataset.node, node]));
		const links: GraphLink[] = [];

		for (const line of graph.querySelectorAll<SVGLineElement>("[data-source][data-target]")) {
			const source = nodesById.get(line.dataset.source);
			const target = nodesById.get(line.dataset.target);

			if (!source || !target) continue;

			// Match each spring's rest length to the server-rendered layout.
			const restLength = Math.hypot(target.x - source.x, target.y - source.y);

			links.push({ line, source, target, restLength });
		}

		const renderGraph = () => {
			for (const node of graphNodes) {
				const x = keepInside(node.x, width);
				const y = keepInside(node.y, height);

				if (x !== node.x) node.vx = 0;

				if (y !== node.y) node.vy = 0;

				node.x = x;
				node.y = y;
				node.element.setAttribute("transform", `translate(${x} ${y})`);
			}

			for (const { line, source, target } of links) {
				line.setAttribute("x1", String(source.x));
				line.setAttribute("y1", String(source.y));
				line.setAttribute("x2", String(target.x));
				line.setAttribute("y2", String(target.y));
			}
		};

		const springs = forceLink<GraphNode, GraphLink>(links)
			.distance((link) => link.restLength)
			.strength(({ line }) => (line.classList.contains("secondary") ? 0.06 : 0.13));

		const simulation = forceSimulation(graphNodes)
			.stop()
			.alpha(0)
			.alphaDecay(0.035)
			.alphaMin(0.045)
			.velocityDecay(0.18)
			.force("links", springs)
			.force("collision", forceCollide(7).strength(0.3))
			.force("home-x", forceX<GraphNode>((node) => node.homeX).strength(0.055))
			.force("home-y", forceY<GraphNode>((node) => node.homeY).strength(0.055));

		let frame = 0;
		let lastTick = 0;

		// Keep the spring timing independent of display refresh rate.
		const advanceSimulation = (time: number) => {
			const elapsed = time - lastTick;
			const ticks = Math.floor(elapsed / tickInterval);

			if (ticks > 0) {
				lastTick = time - (elapsed % tickInterval);
				simulation.tick(Math.min(ticks, maxTicksPerFrame));
				renderGraph();
			}

			frame =
				simulation.alpha() >= simulation.alphaMin() ? requestAnimationFrame(advanceSimulation) : 0;
		};

		const startSimulation = () => {
			if (frame) return;

			lastTick = performance.now();
			frame = requestAnimationFrame(advanceSimulation);
		};

		const stopSimulation = () => {
			cancelAnimationFrame(frame);
			frame = 0;
		};

		const entrance = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting) || !this.isConnected) return;

			entrance.disconnect();

			if (reducedMotion.matches) return;

			// Start at the rendered positions and let the springs react to an inward impulse.
			const centerX = width / 2;
			const centerY = height / 2;

			for (const node of graphNodes) {
				node.vx = ((centerX - node.x) / centerX) * entranceImpulse;
				node.vy = ((centerY - node.y) / centerY) * entranceImpulse;
			}

			simulation.alpha(entranceAlpha);
			startSimulation();
		});

		entrance.observe(graph);

		const stopForReducedMotion = () => {
			if (!reducedMotion.matches) return;

			simulation.alpha(0).alphaTarget(0);
			stopSimulation();

			for (const node of graphNodes) {
				node.vx = 0;
				node.vy = 0;
			}
		};

		reducedMotion.addEventListener("change", stopForReducedMotion);

		let activeNode: SVGGraphicsElement | null = null;

		const highlightNode = (node: SVGGraphicsElement | null) => {
			if (activeNode === node) return;

			for (const { line, source, target } of links) {
				line.classList.toggle("highlighted", source.element === node || target.element === node);
			}

			activeNode = node;
			label.textContent = node?.querySelector("title")?.textContent ?? currentTitle;
		};

		nodes
			.on("pointerenter.graph focusin.graph", function () {
				highlightNode(this);
			})
			.on("pointerleave.graph focusout.graph", () => {
				highlightNode(graph.querySelector<SVGGraphicsElement>(".node:has(a:focus-visible)"));
			})
			.call(
				drag<SVGGraphicsElement, GraphNode>()
					.container(graph)
					.clickDistance(4)
					.on("start", (_event, node) => {
						entrance.disconnect();
						node.fx = node.x;
						node.fy = node.y;
						node.dragMotion = { time: performance.now(), vx: 0, vy: 0 };
					})
					.on(
						"drag",
						function (event: D3DragEvent<SVGGraphicsElement, GraphNode, GraphNode>, node) {
							const motion = node.dragMotion;

							if (!motion) return;

							const x = keepInside(event.x, width);
							const y = keepInside(event.y, height);
							const time = performance.now();
							const ticks = Math.max(1, (time - motion.time) / tickInterval);

							motion.vx = (motion.vx + (x - node.x) / ticks) / 2;
							motion.vy = (motion.vy + (y - node.y) / ticks) / 2;
							motion.time = time;

							node.x = x;
							node.y = y;
							node.fx = node.x;
							node.fy = node.y;
							node.vx = 0;
							node.vy = 0;

							if (!reducedMotion.matches && simulation.alphaTarget() === 0) {
								simulation.alpha(Math.max(simulation.alpha(), dragAlpha)).alphaTarget(dragAlpha);
								startSimulation();
							}

							this.classList.add("dragging");
							highlightNode(this);

							if (reducedMotion.matches) renderGraph();
						},
					)
					.on("end", function (event: D3DragEvent<SVGGraphicsElement, GraphNode, GraphNode>, node) {
						node.fx = null;
						node.fy = null;

						const motion = node.dragMotion;
						delete node.dragMotion;

						if (motion && !reducedMotion.matches) {
							// A held node loses the pointer's momentum before release.
							const carry = Math.exp(-(performance.now() - motion.time) / 45);
							const speed = Math.hypot(motion.vx, motion.vy);
							const scale = carry / Math.max(1, speed / 4);

							node.vx = motion.vx * scale;
							node.vy = motion.vy * scale;
						}

						this.classList.remove("dragging");

						if (!event.active) simulation.alphaTarget(0);
					}),
			);

		this.#disconnect = () => {
			entrance.disconnect();
			reducedMotion.removeEventListener("change", stopForReducedMotion);
			stopSimulation();
			nodes.on(".graph", null).on(".drag", null).classed("dragging", false);

			for (const node of graphNodes) {
				delete node.dragMotion;
				node.x = node.homeX;
				node.y = node.homeY;
			}

			highlightNode(null);
			renderGraph();
		};
	}

	disconnectedCallback() {
		this.#disconnect?.();
		this.#disconnect = undefined;
	}
}

customElements.define("post-link-graph", PostLinkGraph);
