import { useEffect, useRef, useState } from "react";

type Props = {
  onChange: (dataUrl: string) => void;
};

export default function Whiteboard({ onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color] = useState("#0f172a");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    onChange(canvas.toDataURL("image/png"));

    function pos(e: MouseEvent | Touch) {
      const r = canvas.getBoundingClientRect();
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      return {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY,
      };
    }

    function emit() {
      onChange(canvas.toDataURL("image/png"));
    }

    function down(e: MouseEvent | TouchEvent) {
      drawing.current = true;
      const p =
        "touches" in e ? pos(e.touches[0]) : pos(e as unknown as MouseEvent);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const p =
        "touches" in e ? pos(e.touches[0]) : pos(e as unknown as MouseEvent);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    function up() {
      if (drawing.current) {
        drawing.current = false;
        emit();
      }
    }

    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    canvas.addEventListener("touchstart", down, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", up);

    return () => {
      canvas.removeEventListener("mousedown", down);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      canvas.removeEventListener("touchstart", down);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", up);
    };
  }, [color, onChange]);

  function clear() {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-mist">Whiteboard</span>
        <button
          type="button"
          onClick={clear}
          className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={ref}
        width={800}
        height={420}
        className="w-full max-h-[40vh] rounded-xl border border-slate-200 bg-white touch-none"
      />
    </div>
  );
}
