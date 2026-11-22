import type {
	CustomFieldDef,
	CustomFieldOption,
	CustomFieldValue,
	Task,
} from "../../types/task";
import { normalizeChecklistItems } from "../../utils/checklistField";
import { normalizeLinkItems } from "../../utils/linkField";
import { ensureUniqueIds } from "../../utils/reorder";

export const generateRandomId = (prefix: string): string =>
	`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const resolveFieldOptions = (
	field: CustomFieldValue,
	presetFields: CustomFieldDef[],
): CustomFieldOption[] =>
	field.options ||
	(field.field_id
		? presetFields.find((f) => f.id === field.field_id)?.options
		: undefined) ||
	[];

export const parseInitialCustomFields = (
	taskData: Task | null,
	presetFields: CustomFieldDef[],
): CustomFieldValue[] => {
	if (!taskData?.custom_fields) return [];
	if (Array.isArray(taskData.custom_fields)) {
		return ensureUniqueIds(
			taskData.custom_fields.map((cf) => {
				const fieldId = cf.id || cf.field_id || generateRandomId("cf");
				const fieldType = cf.type || "text";
				return {
					id: fieldId,
					field_id: cf.field_id,
					name: cf.name || cf.field_id || "Field",
					type: fieldType,
					value:
						fieldType === "link"
							? normalizeLinkItems(cf.value, `link-${fieldId}`)
							: fieldType === "checklist"
								? normalizeChecklistItems(cf.value, `item-${fieldId}`)
								: cf.value,
					options: cf.options,
					enabled: cf.enabled ?? true,
				};
			}),
			"cf",
		);
	}
	// Legacy Record<string, CustomFieldValue> fallback
	const legacyMap = taskData.custom_fields as unknown as Record<
		string,
		Partial<CustomFieldValue> | undefined
	>;
	return ensureUniqueIds(
		Object.entries(legacyMap).map(([key, cf]) => {
			const fieldDef = presetFields.find((f) => f.id === key);
			const fieldType = fieldDef ? fieldDef.type : "text";
			return {
				id: key,
				field_id: key,
				name: fieldDef ? fieldDef.name : key.replace("cf-", ""),
				type: fieldType,
				options: fieldDef?.options,
				value:
					fieldType === "link"
						? normalizeLinkItems(cf?.value, `link-${key}`)
						: fieldType === "checklist"
							? normalizeChecklistItems(cf?.value, `item-${key}`)
							: (cf?.value ?? ""),
				enabled: cf?.enabled ?? true,
			};
		}),
		"cf",
	);
};
