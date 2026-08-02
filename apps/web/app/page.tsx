import { EvidenceReviewShortcut } from "@/components/evidence-review-shortcut";
import { InfiniteZoomController } from "@/components/infinite-zoom-controller";
import { TelegramProjectWorkspace } from "@/components/telegram-project-workspace";

export default function HomePage() {
  return (
    <>
      <TelegramProjectWorkspace />
      <InfiniteZoomController />
      <EvidenceReviewShortcut />
    </>
  );
}
