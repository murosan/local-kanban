import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ChevronDown,
	ChevronUp,
	GripVertical,
	Settings,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { CustomFieldValue } from "../../types/task";
import { prefersReducedMotion } from "../../utils/reorder";

interface SortableCustomFieldRowProps {
	field: CustomFieldValue;
	index: number;
	total: number;
	isEditingOptions: boolean;
	onMove: (index: number, direction: "up" | "down") => void;
	onUpdateName: (id: string, name: string) => void;
	onToggleEditOptions: (id: string) => void;
	onRemove: (id: string, name?: string) => void;
	registerItemRef: (fieldId: string, el: HTMLDivElement | null) => void;
	registerMoveButtonRef: (
		fieldId: string,
		dir: "up" | "down",
		el: HTMLButtonElement | null,
	) => void;
	children: React.ReactNode;
}

export const SortableCustomFieldRow: React.FC<SortableCustomFieldRowProps> = ({
	field,
	index,
	total,
	isEditingOptions,
	onMove,
	onUpdateName,
	onToggleEditOptions,
	onRemove,
	registerItemRef,
	registerMoveButtonRef,
	children,
}) => {
	const { t } = useI18n();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: field.id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const setCombinedRef = useCallback(
		(node: HTMLDivElement | null) => {
			setNodeRef(node);
			registerItemRef(field.id, node);
		},
		[field.id, registerItemRef, setNodeRef],
	);

	const fieldDisplayName = field.name || field.id;

	return (
		<div
			ref={setCombinedRef}
			style={style}
			onFocusCapture={(e) => {
				if (
					e.target instanceof HTMLElement &&
					e.target.matches(":focus-visible")
				) {
					e.currentTarget.scrollIntoView({
						block: "nearest",
						inline: "nearest",
					});
				}
			}}
			className={`sortable-field-item flex flex-col space-y-2 border-b border-[var(--border-color)] pb-3.5 last:border-b-0 last:pb-0 rounded-lg transition-shadow ${
				isDragging
					? "relative z-50 bg-[var(--bg-card)] px-2.5 py-2 -mx-2.5 ring-2 ring-blue-500 shadow-xl border-transparent"
					: ""
			}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center space-x-1.5 flex-1 min-w-0">
					<button
						type="button"
						{...attributes}
						{...listeners}
						className="drag-handle cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] focus-visible:bg-[var(--bg-input)] p-1 rounded transition-colors shrink-0"
						aria-label={t("taskModal.dragToReorderField", {
							name: fieldDisplayName,
						})}
						title={t("taskModal.dragToReorderField", {
							name: fieldDisplayName,
						})}
					>
						<GripVertical className="w-3.5 h-3.5" />
					</button>
					{/* Field Name Input (Editable on card) */}
					<input
						type="text"
						value={field.name}
						onChange={(e) => onUpdateName(field.id, e.target.value)}
						className="text-xs font-bold text-[var(--text-primary)] bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-blue-500 focus:bg-[var(--bg-input)] px-1.5 py-0.5 rounded-md transition-all outline-none truncate flex-1 max-w-[220px]"
						placeholder="フィールド名"
					/>
					<span className="text-[10px] uppercase font-mono text-[var(--text-muted)] bg-[var(--bg-input)] px-1.5 py-0.5 rounded border border-[var(--border-color)] shrink-0">
						{field.type}
					</span>
				</div>

				{/* Action Buttons */}
				<div className="flex items-center space-x-1 shrink-0">
					{total > 1 && (
						<>
							<button
								ref={(el) => registerMoveButtonRef(field.id, "up", el)}
								type="button"
								disabled={index === 0}
								onClick={() => onMove(index, "up")}
								className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
								aria-label={t("taskModal.moveFieldUp", {
									name: fieldDisplayName,
								})}
								title={t("taskModal.moveFieldUp", {
									name: fieldDisplayName,
								})}
							>
								<ChevronUp className="w-3.5 h-3.5" />
							</button>
							<button
								ref={(el) => registerMoveButtonRef(field.id, "down", el)}
								type="button"
								disabled={index === total - 1}
								onClick={() => onMove(index, "down")}
								className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
								aria-label={t("taskModal.moveFieldDown", {
									name: fieldDisplayName,
								})}
								title={t("taskModal.moveFieldDown", {
									name: fieldDisplayName,
								})}
							>
								<ChevronDown className="w-3.5 h-3.5" />
							</button>
						</>
					)}
					{field.type === "dropdown" && (
						<button
							type="button"
							onClick={() => onToggleEditOptions(field.id)}
							className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-lg transition-all font-medium ${
								isEditingOptions
									? "bg-blue-600/10 text-blue-500 border border-blue-500/30 font-bold"
									: "text-[var(--text-secondary)] hover:text-blue-500 hover:bg-[var(--bg-input)]"
							}`}
							title="選択肢・色を編集"
						>
							<Settings className="w-3.5 h-3.5" />
							<span>選択肢編集</span>
						</button>
					)}
					<button
						type="button"
						onClick={() => onRemove(field.id, field.name)}
						className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
						title={t("taskModal.removeField")}
					>
						<Trash2 className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Field Control */}
			<div>{children}</div>
		</div>
	);
};
