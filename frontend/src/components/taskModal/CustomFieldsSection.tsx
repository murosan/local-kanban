import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Sliders } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COLOR_PRESETS } from "../../constants/colors";
import { useI18n } from "../../i18n/useI18n";
import type {
	ChecklistItem,
	CustomFieldDef,
	CustomFieldOption,
	CustomFieldType,
	CustomFieldValue,
	LinkItem,
} from "../../types/task";
import { moveItemByOffset, reorderItemsById } from "../../utils/reorder";
import { ChecklistFieldEditor } from "./ChecklistFieldEditor";
import { DropdownFieldEditor } from "./DropdownFieldEditor";
import { LinkFieldEditor } from "./LinkFieldEditor";
import { SortableCustomFieldRow } from "./SortableCustomFieldRow";
import { generateRandomId, resolveFieldOptions } from "./utils";

interface CustomFieldsSectionProps {
	fields: CustomFieldValue[];
	presetFields: CustomFieldDef[];
	modalInstanceId: string;
	isAddFieldOpen: boolean;
	onSetAddFieldOpen: (open: boolean) => void;
	onChangeFields: (nextFields: CustomFieldValue[], immediate: boolean) => void;
	onDragStateChange: (isDragging: boolean) => void;
}

export const CustomFieldsSection: React.FC<CustomFieldsSectionProps> = ({
	fields,
	presetFields,
	modalInstanceId,
	isAddFieldOpen,
	onSetAddFieldOpen,
	onChangeFields,
	onDragStateChange,
}) => {
	const { t } = useI18n();
	const [addFieldMode, setAddFieldMode] = useState<"preset" | "custom">(
		"preset",
	);
	const [newCustomName, setNewCustomName] = useState("");
	const [newCustomType, setNewCustomType] = useState<CustomFieldType>("text");
	const [newOptionsInput, setNewOptionsInput] = useState("");
	const [editingOptionFieldId, setEditingOptionFieldId] = useState<
		string | null
	>(null);

	const [customFieldLiveAnnouncement, setCustomFieldLiveAnnouncement] =
		useState("");
	const [linkValidationAnnouncement, setLinkValidationAnnouncement] =
		useState("");

	const addFieldRef = useRef<HTMLDivElement>(null);
	const customFieldAnnounceTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const linkAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const customFieldItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const customFieldMoveButtonRefs = useRef<
		Map<
			string,
			{ up?: HTMLButtonElement | null; down?: HTMLButtonElement | null }
		>
	>(new Map());

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Close Add Field popover on click outside
	useEffect(() => {
		if (!isAddFieldOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			if (
				addFieldRef.current &&
				!addFieldRef.current.contains(event.target as Node)
			) {
				onSetAddFieldOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isAddFieldOpen, onSetAddFieldOpen]);

	useEffect(() => {
		return () => {
			if (customFieldAnnounceTimerRef.current) {
				clearTimeout(customFieldAnnounceTimerRef.current);
			}
			if (linkAnnounceTimerRef.current) {
				clearTimeout(linkAnnounceTimerRef.current);
			}
			document.documentElement.classList.remove("is-dragging-item");
		};
	}, []);

	const registerCustomFieldItemRef = useCallback(
		(fieldId: string, el: HTMLDivElement | null) => {
			if (el) {
				customFieldItemRefs.current.set(fieldId, el);
			} else {
				customFieldItemRefs.current.delete(fieldId);
			}
		},
		[],
	);

	const registerCustomFieldMoveButtonRef = useCallback(
		(fieldId: string, dir: "up" | "down", el: HTMLButtonElement | null) => {
			const entry = customFieldMoveButtonRefs.current.get(fieldId) || {};
			entry[dir] = el;
			if (!entry.up && !entry.down) {
				customFieldMoveButtonRefs.current.delete(fieldId);
			} else {
				customFieldMoveButtonRefs.current.set(fieldId, entry);
			}
		},
		[],
	);

	const announceCustomFieldMove = useCallback(
		(fieldName: string, newIndex: number, total: number) => {
			if (customFieldAnnounceTimerRef.current) {
				clearTimeout(customFieldAnnounceTimerRef.current);
			}
			setCustomFieldLiveAnnouncement("");
			customFieldAnnounceTimerRef.current = setTimeout(() => {
				setCustomFieldLiveAnnouncement(
					t("taskModal.fieldMovedAnnouncement", {
						name: fieldName,
						position: newIndex + 1,
						total,
					}),
				);
			}, 150);
		},
		[t],
	);

	const announceLinkValidationError = useCallback((message: string) => {
		if (linkAnnounceTimerRef.current) {
			clearTimeout(linkAnnounceTimerRef.current);
		}
		setLinkValidationAnnouncement("");
		if (!message) return;
		linkAnnounceTimerRef.current = setTimeout(() => {
			setLinkValidationAnnouncement(message);
		}, 500);
	}, []);

	const updateField = (
		id: string,
		updates: Partial<CustomFieldValue>,
		immediate?: boolean,
	) => {
		const nextFields = fields.map((cf) =>
			cf.id === id ? { ...cf, ...updates } : cf,
		);
		const isImmediate =
			immediate ??
			(typeof updates.value === "boolean" || updates.enabled !== undefined);
		onChangeFields(nextFields, isImmediate);
	};

	const handleMoveField = (index: number, direction: "up" | "down") => {
		const delta = direction === "up" ? -1 : 1;
		const reordered = moveItemByOffset(fields, index, delta);
		if (reordered === fields) return;

		const targetIndex = index + delta;
		const movedField = reordered[targetIndex];
		onChangeFields(reordered, true);
		announceCustomFieldMove(
			movedField.name || movedField.id,
			targetIndex,
			reordered.length,
		);

		requestAnimationFrame(() => {
			const itemEl = customFieldItemRefs.current.get(movedField.id);
			itemEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
			const buttons = customFieldMoveButtonRefs.current.get(movedField.id);
			const hitStart = direction === "up" && targetIndex === 0;
			const hitEnd =
				direction === "down" && targetIndex === reordered.length - 1;
			const targetBtn =
				hitStart && buttons?.down
					? buttons.down
					: hitEnd && buttons?.up
						? buttons.up
						: buttons?.[direction];
			targetBtn?.focus({ preventScroll: true });
		});
	};

	const handleDragStart = () => {
		onDragStateChange(true);
		document.documentElement.classList.add("is-dragging-item");
	};

	const handleDragEnd = (event: DragEndEvent) => {
		onDragStateChange(false);
		document.documentElement.classList.remove("is-dragging-item");

		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const reordered = reorderItemsById(
			fields,
			String(active.id),
			String(over.id),
		);
		if (reordered === fields) return;

		const newIndex = reordered.findIndex((f) => f.id === String(active.id));
		onChangeFields(reordered, true);
		if (newIndex !== -1) {
			const movedField = reordered[newIndex];
			announceCustomFieldMove(
				movedField.name || movedField.id,
				newIndex,
				reordered.length,
			);
			requestAnimationFrame(() => {
				customFieldItemRefs.current
					.get(movedField.id)
					?.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		}
	};

	const handleDragCancel = () => {
		onDragStateChange(false);
		document.documentElement.classList.remove("is-dragging-item");
	};

	const handleRemoveField = (id: string, name?: string) => {
		const fieldName =
			name || fields.find((cf) => cf.id === id)?.name || "Field";
		if (!confirm(t("taskModal.removeFieldConfirm", { name: fieldName }))) {
			return;
		}
		onChangeFields(
			fields.filter((cf) => cf.id !== id),
			true,
		);
	};

	const handleAddPresetField = (preset: CustomFieldDef) => {
		let initialValue: CustomFieldValue["value"] = "";
		if (preset.type === "checkbox") {
			initialValue = false;
		} else if (preset.type === "link") {
			initialValue = [];
		} else if (preset.type === "checklist") {
			initialValue =
				preset.options && preset.options.length > 0
					? preset.options.map((opt) => ({
							id: generateRandomId("item"),
							text: opt.value,
							completed: false,
						}))
					: [];
		}

		const newField: CustomFieldValue = {
			id: generateRandomId("cf"),
			field_id: preset.id,
			name: preset.name,
			type: preset.type,
			options: preset.options ? [...preset.options] : undefined,
			value: initialValue,
			enabled: true,
		};
		onChangeFields([...fields, newField], true);
		onSetAddFieldOpen(false);
	};

	const handleCreateCustomField = () => {
		if (!newCustomName.trim()) return;

		let options: CustomFieldOption[] | undefined;
		let initialValue: CustomFieldValue["value"] = "";

		if (
			(newCustomType === "dropdown" || newCustomType === "checklist") &&
			newOptionsInput.trim()
		) {
			const optionValues = newOptionsInput
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			options = optionValues.map((val, idx) => ({
				id: `${generateRandomId("opt")}-${idx}`,
				value: val,
				color: COLOR_PRESETS[idx % COLOR_PRESETS.length],
			}));
		}

		if (newCustomType === "checkbox") {
			initialValue = false;
		} else if (newCustomType === "link") {
			initialValue = [];
		} else if (newCustomType === "checklist") {
			initialValue =
				options && options.length > 0
					? options.map((opt) => ({
							id: generateRandomId("item"),
							text: opt.value,
							completed: false,
						}))
					: [];
		}

		const newField: CustomFieldValue = {
			id: generateRandomId("cf"),
			name: newCustomName.trim(),
			type: newCustomType,
			options,
			value: initialValue,
			enabled: true,
		};
		onChangeFields([...fields, newField], true);
		setNewCustomName("");
		setNewOptionsInput("");
		onSetAddFieldOpen(false);
	};

	const handleAddOptionToField = (fieldId: string, optionValue: string) => {
		const val = optionValue.trim();
		if (!val) return;
		const nextFields = fields.map((cf) => {
			if (cf.id !== fieldId) return cf;
			const currentOptions = resolveFieldOptions(cf, presetFields);
			if (currentOptions.some((opt) => opt.value === val)) return cf;
			const color = COLOR_PRESETS[currentOptions.length % COLOR_PRESETS.length];
			const newOpt: CustomFieldOption = {
				id: generateRandomId("opt"),
				value: val,
				color,
			};
			return { ...cf, options: [...currentOptions, newOpt] };
		});
		onChangeFields(nextFields, true);
	};

	const handleOptionColorChange = (
		fieldId: string,
		optionId: string,
		color: string,
	) => {
		const nextFields = fields.map((cf) => {
			if (cf.id !== fieldId) return cf;
			const currentOptions = resolveFieldOptions(cf, presetFields);
			return {
				...cf,
				options: currentOptions.map((opt) =>
					opt.id === optionId || opt.value === optionId
						? { ...opt, color }
						: opt,
				),
			};
		});
		onChangeFields(nextFields, true);
	};

	const handleOptionValueChange = (
		fieldId: string,
		optionId: string,
		newValue: string,
	) => {
		const nextFields = fields.map((cf) => {
			if (cf.id !== fieldId) return cf;
			const currentOptions = resolveFieldOptions(cf, presetFields);
			const targetOpt = currentOptions.find(
				(opt) => opt.id === optionId || opt.value === optionId,
			);
			const nextOptions = currentOptions.map((opt) =>
				opt.id === optionId || opt.value === optionId
					? { ...opt, value: newValue }
					: opt,
			);
			const nextSelectedValue =
				targetOpt && cf.value === targetOpt.value ? newValue : cf.value;
			return { ...cf, value: nextSelectedValue, options: nextOptions };
		});
		onChangeFields(nextFields, true);
	};

	const handleRemoveOptionFromField = (fieldId: string, optionId: string) => {
		const nextFields = fields.map((cf) => {
			if (cf.id !== fieldId) return cf;
			const currentOptions = resolveFieldOptions(cf, presetFields);
			return {
				...cf,
				options: currentOptions.filter(
					(opt) => opt.id !== optionId && opt.value !== optionId,
				),
			};
		});
		onChangeFields(nextFields, true);
	};

	const updateChecklistItems = (
		fieldId: string,
		updater: (items: ChecklistItem[]) => ChecklistItem[],
		immediate: boolean,
	) => {
		const nextFields = fields.map((cf) => {
			if (cf.id !== fieldId) return cf;
			const currentItems = Array.isArray(cf.value)
				? (cf.value as ChecklistItem[])
				: [];
			return { ...cf, value: updater(currentItems) };
		});
		onChangeFields(nextFields, immediate);
	};

	const handleUpdateLinks = (fieldId: string, nextItems: LinkItem[]) => {
		updateField(fieldId, { value: nextItems }, true);
	};

	return (
		<div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)] space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
					<Sliders className="w-4 h-4 text-blue-500" />
					<span>{t("taskModal.customFieldsLabel")}</span>
					<span className="text-[10px] font-mono text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold">
						{fields.length}
					</span>
				</div>

				{/* Add Custom Field Button & Popover */}
				<div className="relative" ref={addFieldRef}>
					<button
						type="button"
						onClick={() => onSetAddFieldOpen(!isAddFieldOpen)}
						className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all cursor-pointer border border-blue-400/30"
					>
						<Plus className="w-4 h-4" />
						<span>{t("taskModal.addField")}</span>
					</button>

					{isAddFieldOpen && (
						<div className="absolute right-0 mt-2 w-80 bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-4 z-30 space-y-3 animate-in fade-in duration-150 ring-1 ring-black/10">
							<div className="flex p-1 bg-[var(--bg-input)] rounded-xl text-xs font-semibold">
								<button
									type="button"
									onClick={() => setAddFieldMode("preset")}
									className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
										addFieldMode === "preset"
											? "bg-blue-600 text-white font-bold shadow-sm"
											: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
									}`}
								>
									{t("taskModal.addPreset")}
								</button>
								<button
									type="button"
									onClick={() => setAddFieldMode("custom")}
									className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
										addFieldMode === "custom"
											? "bg-blue-600 text-white font-bold shadow-sm"
											: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
									}`}
								>
									{t("taskModal.addCustom")}
								</button>
							</div>

							{addFieldMode === "preset" && (
								<div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
									{presetFields.length > 0 ? (
										presetFields.map((preset) => (
											<button
												key={preset.id}
												type="button"
												onClick={() => handleAddPresetField(preset)}
												className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-input)] hover:bg-blue-500/15 hover:text-blue-500 border border-transparent hover:border-blue-500/30 text-[var(--text-primary)] transition-all text-left"
											>
												<span>{preset.name}</span>
												<span className="text-[10px] uppercase font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">
													{preset.type}
												</span>
											</button>
										))
									) : (
										<p className="text-xs text-[var(--text-muted)] py-3 text-center">
											{t("taskModal.noPresets")}
										</p>
									)}
								</div>
							)}

							{addFieldMode === "custom" && (
								<div className="space-y-3">
									<div>
										<label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
											{t("configModal.fieldTitle")}{" "}
											<span className="text-rose-500">*</span>
										</label>
										<input
											type="text"
											value={newCustomName}
											onChange={(e) => setNewCustomName(e.target.value)}
											placeholder="例: 優先度, 期日, 担当者"
											className="w-full px-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
										/>
									</div>

									<div>
										<label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
											{t("configModal.fieldType")}
										</label>
										<select
											value={newCustomType}
											onChange={(e) =>
												setNewCustomType(e.target.value as CustomFieldType)
											}
											className="w-full px-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
										>
											<option value="text">{t("configModal.typeText")}</option>
											<option value="number">
												{t("configModal.typeNumber")}
											</option>
											<option value="date">{t("configModal.typeDate")}</option>
											<option value="dropdown">
												{t("configModal.typeDropdown")}
											</option>
											<option value="checklist">
												{t("configModal.typeChecklist") || "チェックリスト"}
											</option>
											<option value="checkbox">
												{t("configModal.typeCheckbox")}
											</option>
											<option value="link">{t("configModal.typeLink")}</option>
										</select>
									</div>

									{(newCustomType === "dropdown" ||
										newCustomType === "checklist") && (
										<div>
											<label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
												{newCustomType === "checklist"
													? t("configModal.checklistItemsPlaceholder") ||
														"デフォルト項目（カンマ区切り）"
													: "選択肢（カンマ区切り）"}
											</label>
											<input
												type="text"
												value={newOptionsInput}
												onChange={(e) => setNewOptionsInput(e.target.value)}
												placeholder={
													newCustomType === "checklist"
														? t("configModal.checklistItemsPlaceholder") ||
															"例: 要件定義, 実装, テスト"
														: "高, 中, 低"
												}
												className="w-full px-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
											/>
										</div>
									)}

									<div className="flex justify-end gap-2 pt-1">
										<button
											type="button"
											onClick={() => onSetAddFieldOpen(false)}
											className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-input)] rounded-xl"
										>
											{t("taskModal.cancel")}
										</button>
										<button
											type="button"
											onClick={handleCreateCustomField}
											disabled={!newCustomName.trim()}
											className="inline-flex items-center space-x-1 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md disabled:opacity-50"
										>
											<Plus className="w-3.5 h-3.5" />
											<span>{t("configModal.add")}</span>
										</button>
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Live Regions */}
			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{customFieldLiveAnnouncement}
			</div>
			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{linkValidationAnnouncement}
			</div>

			{/* Custom Fields List */}
			{fields.length > 0 ? (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onDragCancel={handleDragCancel}
				>
					<SortableContext
						items={fields.map((f) => f.id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="flex flex-col space-y-3 pt-1">
							{fields.map((field, fieldIndex) => (
								<SortableCustomFieldRow
									key={field.id}
									field={field}
									index={fieldIndex}
									total={fields.length}
									isEditingOptions={editingOptionFieldId === field.id}
									onMove={handleMoveField}
									onUpdateName={(id, name) => updateField(id, { name })}
									onToggleEditOptions={(id) =>
										setEditingOptionFieldId((prev) => (prev === id ? null : id))
									}
									onRemove={handleRemoveField}
									registerItemRef={registerCustomFieldItemRef}
									registerMoveButtonRef={registerCustomFieldMoveButtonRef}
								>
									{field.type === "dropdown" && (
										<DropdownFieldEditor
											field={field}
											resolvedOptions={resolveFieldOptions(field, presetFields)}
											isEditingOptions={editingOptionFieldId === field.id}
											onValueChange={(value) =>
												updateField(field.id, { value }, true)
											}
											onOptionValueChange={(optId, newVal) =>
												handleOptionValueChange(field.id, optId, newVal)
											}
											onOptionColorChange={(optId, color) =>
												handleOptionColorChange(field.id, optId, color)
											}
											onRemoveOption={(optId) =>
												handleRemoveOptionFromField(field.id, optId)
											}
											onAddOption={(optVal) =>
												handleAddOptionToField(field.id, optVal)
											}
										/>
									)}

									{field.type === "text" && (
										<input
											type="text"
											value={String(field.value ?? "")}
											onChange={(e) =>
												updateField(field.id, { value: e.target.value })
											}
											placeholder={field.name}
											className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
										/>
									)}

									{field.type === "number" && (
										<input
											type="number"
											value={String(field.value ?? "")}
											onChange={(e) =>
												updateField(field.id, { value: e.target.value })
											}
											placeholder="0"
											className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
										/>
									)}

									{field.type === "date" && (
										<input
											type="date"
											value={String(field.value ?? "")}
											onChange={(e) =>
												updateField(field.id, { value: e.target.value }, true)
											}
											className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
										/>
									)}

									{field.type === "checkbox" && (
										<label className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl cursor-pointer">
											<input
												type="checkbox"
												checked={!!field.value}
												onChange={(e) =>
													updateField(
														field.id,
														{ value: e.target.checked },
														true,
													)
												}
												className="w-4 h-4 text-blue-600 rounded border border-[var(--border-color)] focus:ring-blue-500"
											/>
											<span className="text-xs text-[var(--text-primary)] font-medium">
												{field.name}
											</span>
										</label>
									)}

									{field.type === "link" && (
										<LinkFieldEditor
											field={field}
											modalInstanceId={modalInstanceId}
											onUpdateLinks={(nextItems) =>
												handleUpdateLinks(field.id, nextItems)
											}
											onAnnounceValidationError={announceLinkValidationError}
										/>
									)}

									{field.type === "checklist" && (
										<ChecklistFieldEditor
											field={field}
											onToggleItem={(itemId) =>
												updateChecklistItems(
													field.id,
													(items) =>
														items.map((item) =>
															item.id === itemId
																? { ...item, completed: !item.completed }
																: item,
														),
													true,
												)
											}
											onUpdateItemText={(itemId, newText) =>
												updateChecklistItems(
													field.id,
													(items) =>
														items.map((item) =>
															item.id === itemId
																? { ...item, text: newText }
																: item,
														),
													false,
												)
											}
											onRemoveItem={(itemId) =>
												updateChecklistItems(
													field.id,
													(items) => items.filter((item) => item.id !== itemId),
													true,
												)
											}
											onAddItem={(itemText) => {
												const trimmed = itemText.trim();
												if (!trimmed) return;
												updateChecklistItems(
													field.id,
													(items) => [
														...items,
														{
															id: generateRandomId("item"),
															text: trimmed,
															completed: false,
														},
													],
													true,
												);
											}}
										/>
									)}
								</SortableCustomFieldRow>
							))}
						</div>
					</SortableContext>
				</DndContext>
			) : (
				<p className="text-xs text-[var(--text-muted)] text-center py-2 font-medium">
					カスタムフィールドがありません。「＋
					フィールドを追加」から追加できます。
				</p>
			)}
		</div>
	);
};
