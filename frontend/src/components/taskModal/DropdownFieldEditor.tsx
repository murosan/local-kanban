import { ChevronDown } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { COLOR_PRESETS } from "../../constants/colors";
import { useI18n } from "../../i18n/useI18n";
import type { CustomFieldOption, CustomFieldValue } from "../../types/task";

interface DropdownFieldEditorProps {
	field: CustomFieldValue;
	resolvedOptions: CustomFieldOption[];
	isEditingOptions: boolean;
	onValueChange: (value: string) => void;
	onOptionValueChange: (optionId: string, newValue: string) => void;
	onOptionColorChange: (optionId: string, color: string) => void;
	onRemoveOption: (optionId: string) => void;
	onAddOption: (optionValue: string) => void;
}

export const DropdownFieldEditor: React.FC<DropdownFieldEditorProps> = ({
	field,
	resolvedOptions,
	isEditingOptions,
	onValueChange,
	onOptionValueChange,
	onOptionColorChange,
	onRemoveOption,
	onAddOption,
}) => {
	const { t } = useI18n();
	const [addOptionInput, setAddOptionInput] = useState("");

	const selectedOpt = resolvedOptions.find((opt) => opt.value === field.value);
	const optionColor = selectedOpt?.color;

	const handleSubmitOption = () => {
		if (!addOptionInput.trim()) return;
		onAddOption(addOptionInput);
		setAddOptionInput("");
	};

	return (
		<div className="space-y-2">
			<div className="relative flex items-center">
				{optionColor && (
					<span
						className="absolute left-3.5 w-3 h-3 rounded-full pointer-events-none transition-colors shadow-sm"
						style={{ backgroundColor: optionColor }}
					/>
				)}
				<select
					value={String(field.value ?? "")}
					onChange={(e) => onValueChange(e.target.value)}
					className={`w-full py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer ${
						optionColor ? "pl-9 pr-9 font-medium" : "px-3 pr-9"
					}`}
				>
					<option value="">-- {t("configModal.typeDropdown")} --</option>
					{resolvedOptions.map((opt) => (
						<option
							key={opt.id}
							value={opt.value}
							className="bg-[var(--modal-bg)] text-[var(--text-primary)]"
						>
							{opt.value}
						</option>
					))}
				</select>
				<ChevronDown className="absolute right-3 w-4 h-4 text-[var(--text-secondary)] pointer-events-none" />
			</div>

			{isEditingOptions && (
				<div className="bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)] space-y-2.5 animate-in fade-in duration-150">
					<div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
						<span>プルダウン選択肢（色付け設定）:</span>
					</div>

					<div className="space-y-2">
						{resolvedOptions.length > 0 ? (
							resolvedOptions.map((opt) => (
								<div
									key={opt.id}
									className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] gap-2"
								>
									<div className="flex items-center space-x-2 flex-1 min-w-0">
										<span
											className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
											style={{
												backgroundColor: opt.color || "#3b82f6",
											}}
										/>
										<input
											type="text"
											value={opt.value}
											onChange={(e) =>
												onOptionValueChange(opt.id, e.target.value)
											}
											className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2 py-0.5 text-xs font-medium text-[var(--text-primary)] flex-1 outline-none truncate"
											placeholder="選択肢名"
										/>
									</div>

									<div className="flex items-center space-x-1 justify-end shrink-0">
										{COLOR_PRESETS.map((colorHex) => (
											<button
												key={colorHex}
												type="button"
												onClick={() => onOptionColorChange(opt.id, colorHex)}
												className={`w-3.5 h-3.5 rounded-full transition-transform ${
													opt.color === colorHex
														? "scale-125 ring-2 ring-white/60 shadow-md"
														: "hover:scale-110 opacity-70 hover:opacity-100"
												}`}
												style={{ backgroundColor: colorHex }}
											/>
										))}
										<button
											type="button"
											onClick={() => onRemoveOption(opt.id)}
											className="p-1 text-xs text-rose-500 hover:text-rose-600 font-bold ml-1"
											title="選択肢を削除"
										>
											×
										</button>
									</div>
								</div>
							))
						) : (
							<span className="text-xs text-[var(--text-muted)] italic block">
								選択肢が設定されていません
							</span>
						)}
					</div>

					<div className="flex items-center gap-1.5 pt-1">
						<input
							type="text"
							value={addOptionInput}
							onChange={(e) => setAddOptionInput(e.target.value)}
							placeholder="＋ 選択肢を追加（例: 高, 中, 低）"
							className="flex-1 px-2.5 py-1 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.nativeEvent.isComposing) {
									e.preventDefault();
									handleSubmitOption();
								}
							}}
						/>
						<button
							type="button"
							onClick={handleSubmitOption}
							disabled={!addOptionInput.trim()}
							className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shrink-0 disabled:opacity-50"
						>
							追加
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
