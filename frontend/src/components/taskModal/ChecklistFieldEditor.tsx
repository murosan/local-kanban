import { CheckSquare, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { ChecklistItem, CustomFieldValue } from "../../types/task";

interface ChecklistFieldEditorProps {
	field: CustomFieldValue;
	onToggleItem: (itemId: string) => void;
	onUpdateItemText: (itemId: string, newText: string) => void;
	onRemoveItem: (itemId: string) => void;
	onAddItem: (itemText: string) => void;
}

export const ChecklistFieldEditor: React.FC<ChecklistFieldEditorProps> = ({
	field,
	onToggleItem,
	onUpdateItemText,
	onRemoveItem,
	onAddItem,
}) => {
	const { t } = useI18n();
	const [inputText, setInputText] = useState("");

	const items = Array.isArray(field.value)
		? (field.value as ChecklistItem[])
		: [];
	const completedCount = items.filter((i) => i.completed).length;
	const totalCount = items.length;
	const progressPercent =
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

	const handleSubmitItem = () => {
		if (!inputText.trim()) return;
		onAddItem(inputText);
		setInputText("");
	};

	return (
		<div className="space-y-2.5 bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)]">
			{/* Progress Header */}
			<div className="flex items-center justify-between text-xs">
				<span className="font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
					<CheckSquare className="w-3.5 h-3.5 text-blue-500" />
					<span>進捗状況</span>
				</span>
				<span className="font-bold text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
					{t("taskModal.checklistCompleted", {
						completed: completedCount,
						total: totalCount,
					}) || `${completedCount}/${totalCount} 完了`}{" "}
					({progressPercent}%)
				</span>
			</div>

			{/* Progress Bar */}
			<div className="w-full h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden border border-[var(--border-color)]">
				<div
					className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			{/* Items List */}
			<div className="space-y-1.5 pt-1">
				{items.length > 0 ? (
					items.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--border-color)]/80 transition-all"
						>
							<label className="flex items-center space-x-2 flex-1 min-w-0 cursor-pointer">
								<input
									type="checkbox"
									checked={item.completed}
									onChange={() => onToggleItem(item.id)}
									className="w-4 h-4 text-blue-600 rounded border border-[var(--border-color)] focus:ring-blue-500 shrink-0 cursor-pointer"
								/>
								<input
									type="text"
									value={item.text}
									onChange={(e) => onUpdateItemText(item.id, e.target.value)}
									className={`text-xs bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-blue-500 focus:bg-[var(--bg-input)] px-1 py-0.5 rounded outline-none flex-1 truncate transition-all ${
										item.completed
											? "line-through text-[var(--text-muted)] opacity-70"
											: "text-[var(--text-primary)] font-medium"
									}`}
								/>
							</label>
							<button
								type="button"
								onClick={() => onRemoveItem(item.id)}
								className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded transition-colors shrink-0 opacity-80 hover:opacity-100"
								title="項目を削除"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					))
				) : (
					<p className="text-xs text-[var(--text-muted)] italic py-1 text-center">
						{t("taskModal.noChecklistItems") || "チェック項目がありません"}
					</p>
				)}
			</div>

			{/* Add Item Input Form */}
			<div className="flex items-center gap-1.5 pt-1">
				<input
					type="text"
					value={inputText}
					onChange={(e) => setInputText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.nativeEvent.isComposing) {
							e.preventDefault();
							handleSubmitItem();
						}
					}}
					placeholder={t("taskModal.itemPlaceholder") || "新しい項目を入力..."}
					className="flex-1 px-2.5 py-1 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
				/>
				<button
					type="button"
					onClick={handleSubmitItem}
					disabled={!inputText.trim()}
					className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shrink-0 disabled:opacity-50 transition-colors"
				>
					{t("taskModal.addChecklistItem") || "追加"}
				</button>
			</div>
		</div>
	);
};
