import { StateScreen } from "@/components/ui/StateScreen";

export default function RoomNotFound() {
  return <StateScreen kind="empty" title="No such Chog" body="That room doesn't exist. Chog ids run from 1 to 1,969." />;
}
