import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, GripVertical, Square, Trash2 } from "lucide-react";
import type React from "react";
import type { Column, Task } from "../../types/task";

interface SortableSubtaskItemProps {
	sub: Task;
	columns: Column[];
	onToggle: (sub: Task) => void;
	onOpen: (sub: Task) => void;
	onDelete: (sub: Task) => void;
}

export const SortableSubtaskItem: React.FC<SortableSubtaskItemProps> = ({
	sub,
	columns,
	onToggle,
	onOpen,
	onDelete,
}) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: sub.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isDone = Boolean(sub.completed);
	const matchedCol = columns.find((c) => c.id === sub.column_id);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] group/subtask hover:border-blue-500/40 transition-all ${
				isDragging ? "opacity-50 ring-2 ring-blue-500 z-50 shadow-lg" : ""
			}`}
		>
			<div className="flex items-center space-x-2.5 flex-1 min-w-0">
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded transition-colors shrink-0"
					title="ドラッグして並び替え"
				>
					<GripVertical className="w-3.5 h-3.5" />
				</button>

				<button
					type="button"
					onClick={() => onToggle(sub)}
					className="shrink-0 text-[var(--text-muted)] hover:text-blue-500 transition-colors cursor-pointer"
				>
					{isDone ? (
						<CheckSquare className="w-4 h-4 text-emerald-500" />
					) : (
						<Square className="w-4 h-4" />
					)}
				</button>
				<span
					onClick={() => onOpen(sub)}
					className={`text-sm cursor-pointer truncate hover:text-blue-400 transition-colors ${
						isDone
							? "line-through text-[var(--text-muted)]"
							: "text-[var(--text-primary)]"
					}`}
				>
					{sub.title}
				</span>
			</div>
			<div className="flex items-center space-x-2 shrink-0">
				{matchedCol && (
					<span
						className="text-[10px] font-semibold px-2 py-0.5 rounded-md border"
						style={{
							backgroundColor: `${matchedCol.color || "#3b82f6"}15`,
							color: matchedCol.color || "#3b82f6",
							borderColor: `${matchedCol.color || "#3b82f6"}30`,
						}}
					>
						{matchedCol.name}
					</span>
				)}
				<button
					type="button"
					onClick={() => onDelete(sub)}
					className="p-1 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover/subtask:opacity-100 transition-all cursor-pointer"
					title="サブタスクの削除・解除"
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
};
