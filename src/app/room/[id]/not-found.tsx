import { StateScreen } from "@/components/ui/StateScreen";

export default function RoomNotFound() {
  return <StateScreen kind="empty" title="No such Chog" body="That room doesn't exist. Search by the CHOG number shown on OpenSea from the home page." />;
}
