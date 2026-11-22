import {
	AlertCircle,
	Check,
	ExternalLink,
	Link2,
	Pencil,
	X,
} from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { CustomFieldValue, LinkItem } from "../../types/task";
import {
	createLinkItem,
	getLinkDisplayText,
	normalizeLinkItems,
} from "../../utils/linkField";
import { getSafeUrl, isValidUrl } from "../../utils/url";
import { CopyButton } from "../CopyButton";

interface LinkFieldEditorProps {
	field: CustomFieldValue;
	modalInstanceId: string;
	onUpdateLinks: (nextItems: LinkItem[]) => void;
	onAnnounceValidationError: (message: string) => void;
}

export const LinkFieldEditor: React.FC<LinkFieldEditorProps> = ({
	field,
	modalInstanceId,
	onUpdateLinks,
	onAnnounceValidationError,
}) => {
	const { t } = useI18n();
	const [newUrl, setNewUrl] = useState("");
	const [newLabel, setNewLabel] = useState("");
	const [newTouched, setNewTouched] = useState(false);

	const [editingItem, setEditingItem] = useState<{
		itemId: string;
		url: string;
		label: string;
		touched: boolean;
	} | null>(null);

	const newLinkUrlInputRef = useRef<HTMLInputElement | null>(null);
	const editLinkUrlInputRef = useRef<HTMLInputElement | null>(null);

	const linkItems = Array.isArray(field.value)
		? (field.value as LinkItem[])
		: normalizeLinkItems(field.value, `link-${field.id}`);

	const isNewUrlInvalid = Boolean(
		newTouched && newUrl.trim() && !isValidUrl(newUrl),
	);
	const newLinkErrorId = `${modalInstanceId}-link-error-${field.id}`;

	const handleAdd = () => {
		if (!newUrl.trim()) return;
		const newItem = createLinkItem(newUrl, newLabel);
		if (!newItem) {
			setNewTouched(true);
			onAnnounceValidationError(t("taskModal.invalidUrlError"));
			newLinkUrlInputRef.current?.focus();
			return;
		}
		onAnnounceValidationError("");
		onUpdateLinks([...linkItems, newItem]);
		setNewUrl("");
		setNewLabel("");
		setNewTouched(false);
	};

	const handleFinishEdit = () => {
		if (!editingItem) return;
		const safeUrl = getSafeUrl(editingItem.url);
		if (!safeUrl) {
			setEditingItem((prev) => (prev ? { ...prev, touched: true } : null));
			onAnnounceValidationError(t("taskModal.invalidUrlError"));
			editLinkUrlInputRef.current?.focus();
			return;
		}
		onAnnounceValidationError("");
		const trimmedLabel = editingItem.label.trim();
		const nextItems = linkItems.map((item) => {
			if (item.id !== editingItem.itemId) return item;
			const cleaned: LinkItem = {
				id: item.id,
				url: safeUrl,
			};
			if (trimmedLabel) {
				cleaned.label = trimmedLabel;
			}
			return cleaned;
		});
		onUpdateLinks(nextItems);
		setEditingItem(null);
	};

	const handleRemove = (itemId: string) => {
		const targetItem = linkItems.find((item) => item.id === itemId);
		const linkName = targetItem
			? getLinkDisplayText(targetItem) || targetItem.url
			: "";
		const confirmMessage = linkName
			? t("taskModal.removeLinkConfirm", { name: linkName })
			: t("taskModal.removeLinkConfirmGeneric");
		if (!confirm(confirmMessage)) {
			return;
		}
		if (editingItem?.itemId === itemId) {
			setEditingItem(null);
		}
		onUpdateLinks(linkItems.filter((item) => item.id !== itemId));
	};

	return (
		<div className="space-y-2.5 bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)]">
			{/* Links List */}
			{linkItems.length > 0 ? (
				<ul className="space-y-1.5">
					{linkItems.map((item) => {
						const isEditing = editingItem?.itemId === item.id;
						const safeUrl = getSafeUrl(item.url);
						const displayText = getLinkDisplayText(item);
						const linkElementId = `${modalInstanceId}-link-${field.id}-${item.id}`;

						if (isEditing && editingItem) {
							const isEditUrlInvalid = Boolean(
								editingItem.touched && !isValidUrl(editingItem.url),
							);
							const editLinkErrorId = `${modalInstanceId}-link-edit-error-${field.id}-${item.id}`;

							return (
								<li
									key={item.id}
									className="p-2 rounded-lg bg-[var(--bg-surface)] border border-blue-500/40 space-y-2"
								>
									<div className="flex flex-col sm:flex-row gap-1.5">
										<input
											type="text"
											value={editingItem.label}
											onChange={(e) =>
												setEditingItem((prev) =>
													prev ? { ...prev, label: e.target.value } : null,
												)
											}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.nativeEvent.isComposing) {
													e.preventDefault();
													handleFinishEdit();
												}
											}}
											placeholder={t("taskModal.linkLabelPlaceholder")}
											className="sm:w-1/3 px-2.5 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
										/>
										<input
											ref={editLinkUrlInputRef}
											type="text"
											autoFocus
											value={editingItem.url}
											aria-invalid={isEditUrlInvalid ? "true" : "false"}
											aria-describedby={
												isEditUrlInvalid ? editLinkErrorId : undefined
											}
											onChange={(e) => {
												const nextUrl = e.target.value;
												setEditingItem((prev) =>
													prev ? { ...prev, url: nextUrl } : null,
												);
												if (isValidUrl(nextUrl)) {
													onAnnounceValidationError("");
												}
											}}
											onBlur={() => {
												const invalid = !isValidUrl(editingItem.url);
												setEditingItem((prev) =>
													prev ? { ...prev, touched: true } : null,
												);
												if (invalid) {
													onAnnounceValidationError(
														t("taskModal.invalidUrlError"),
													);
												}
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.nativeEvent.isComposing) {
													e.preventDefault();
													handleFinishEdit();
												}
											}}
											placeholder={t("taskModal.linkUrlPlaceholder")}
											className={`flex-1 px-2.5 py-1.5 text-xs bg-[var(--bg-input)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none ${
												isEditUrlInvalid
													? "border-rose-500 focus:border-rose-500"
													: "border-[var(--border-color)] focus:border-blue-500"
											}`}
										/>
									</div>
									{isEditUrlInvalid && (
										<p
											id={editLinkErrorId}
											className="flex items-center space-x-1.5 text-[11px] text-rose-500 font-medium"
										>
											<AlertCircle
												className="w-3.5 h-3.5 shrink-0"
												aria-hidden="true"
											/>
											<span>{t("taskModal.invalidUrlError")}</span>
										</p>
									)}
									<div className="flex items-center justify-end gap-1.5">
										<button
											type="button"
											onClick={() => {
												setEditingItem(null);
												onAnnounceValidationError("");
											}}
											className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors cursor-pointer"
										>
											{t("taskModal.cancel")}
										</button>
										<button
											type="button"
											onClick={handleFinishEdit}
											className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
										>
											<Check className="w-3.5 h-3.5" aria-hidden="true" />
											<span>{t("taskModal.doneEditLink")}</span>
										</button>
										<button
											type="button"
											onClick={() => handleRemove(item.id)}
											className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded transition-colors cursor-pointer"
											aria-label={t("taskModal.removeLink")}
											title={t("taskModal.removeLink")}
										>
											<X className="w-3.5 h-3.5" aria-hidden="true" />
										</button>
									</div>
								</li>
							);
						}

						return (
							<li
								key={item.id}
								className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--border-color)]/80 transition-all"
							>
								<div className="flex items-center space-x-1.5 flex-1 min-w-0">
									{safeUrl ? (
										<a
											id={linkElementId}
											href={safeUrl}
											target="_blank"
											rel="noopener noreferrer"
											data-copy-text={item.url}
											className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-500 hover:underline truncate min-w-0"
											title={item.url}
										>
											<ExternalLink
												className="w-3.5 h-3.5 shrink-0"
												aria-hidden="true"
											/>
											<span className="truncate">{displayText}</span>
										</a>
									) : (
										<span
											id={linkElementId}
											data-copy-text={item.url}
											className="inline-flex items-center space-x-1.5 text-xs text-[var(--text-muted)] truncate min-w-0"
											title={item.url}
										>
											<Link2
												className="w-3.5 h-3.5 shrink-0"
												aria-hidden="true"
											/>
											<span className="truncate">
												{displayText || t("taskModal.emptyLink")}
											</span>
										</span>
									)}
								</div>

								<div className="flex items-center space-x-1 shrink-0">
									{item.url.trim() && (
										<CopyButton
											targetId={linkElementId}
											ariaLabel={t("taskModal.copyLink", {
												name: displayText,
											})}
											size="md"
										/>
									)}
									<button
										type="button"
										onClick={() =>
											setEditingItem({
												itemId: item.id,
												url: item.url,
												label: item.label ?? "",
												touched: false,
											})
										}
										className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-blue-500 hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
										aria-label={t("taskModal.editLink")}
										title={t("taskModal.editLink")}
									>
										<Pencil className="w-3.5 h-3.5" aria-hidden="true" />
									</button>
									<button
										type="button"
										onClick={() => handleRemove(item.id)}
										className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
										aria-label={t("taskModal.removeLink")}
										title={t("taskModal.removeLink")}
									>
										<X className="w-3.5 h-3.5" aria-hidden="true" />
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="text-xs text-[var(--text-muted)] italic py-1 text-center">
					{t("taskModal.noLinks")}
				</p>
			)}

			{/* Add Link Input Form */}
			<div className="space-y-1.5 pt-1">
				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
					<input
						type="text"
						value={newLabel}
						onChange={(e) => setNewLabel(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								handleAdd();
							}
						}}
						placeholder={t("taskModal.linkLabelPlaceholder")}
						className="sm:w-1/3 px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
					/>
					<input
						ref={newLinkUrlInputRef}
						type="text"
						value={newUrl}
						aria-invalid={isNewUrlInvalid ? "true" : "false"}
						aria-describedby={isNewUrlInvalid ? newLinkErrorId : undefined}
						onChange={(e) => {
							const nextUrl = e.target.value;
							setNewUrl(nextUrl);
							if (!nextUrl.trim()) {
								setNewTouched(false);
								onAnnounceValidationError("");
							} else if (isValidUrl(nextUrl)) {
								onAnnounceValidationError("");
							}
						}}
						onBlur={() => {
							if (!newUrl.trim()) return;
							const invalid = !isValidUrl(newUrl);
							setNewTouched(true);
							if (invalid) {
								onAnnounceValidationError(t("taskModal.invalidUrlError"));
							}
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								handleAdd();
							}
						}}
						placeholder={t("taskModal.linkUrlPlaceholder")}
						className={`flex-1 px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none ${
							isNewUrlInvalid
								? "border-rose-500 focus:border-rose-500"
								: "border-[var(--border-color)] focus:border-blue-500"
						}`}
					/>
					<button
						type="button"
						onClick={handleAdd}
						disabled={!newUrl.trim()}
						className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shrink-0 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
					>
						{t("taskModal.addLinkItem")}
					</button>
				</div>
				{isNewUrlInvalid && (
					<p
						id={newLinkErrorId}
						className="flex items-center space-x-1.5 text-[11px] text-rose-500 font-medium"
					>
						<AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
						<span>{t("taskModal.invalidUrlError")}</span>
					</p>
				)}
			</div>
		</div>
	);
};
