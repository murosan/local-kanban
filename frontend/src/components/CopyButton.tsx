import { AlertCircle, Check, Copy } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { useI18n } from "../i18n/useI18n";
import { initCopyCommandListener } from "../utils/copyCommand";

interface CopyButtonProps {
	targetId: string;
	ariaLabel: string;
	size?: "sm" | "md";
	className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
	targetId,
	ariaLabel,
	size = "md",
	className = "",
}) => {
	const { t } = useI18n();

	useEffect(() => {
		initCopyCommandListener();
	}, []);

	const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

	return (
		<span className="copy-wrapper">
			<button
				type="button"
				{...({
					command: "--copy",
					commandfor: targetId,
				} as Record<string, string>)}
				data-copied-message={t("taskModal.copied")}
				data-failed-message={t("taskModal.copyFailed")}
				aria-label={ariaLabel}
				title={ariaLabel}
				onClick={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
				className={`copy-button inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-blue-500 hover:bg-[var(--bg-surface)] focus-visible:outline-2 focus-visible:outline-blue-500 transition-colors cursor-pointer ${className}`}
			>
				<Copy className={`copy-icon-default ${iconSize}`} aria-hidden="true" />
				<Check
					className={`copy-icon-copied ${iconSize} text-emerald-500`}
					aria-hidden="true"
				/>
				<AlertCircle
					className={`copy-icon-failed ${iconSize} text-rose-500`}
					aria-hidden="true"
				/>
			</button>
			<span className="copy-tip" role="status" />
		</span>
	);
};
