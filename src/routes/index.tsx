import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Showdown, TriviaHome } from "@/components/trivia/showdown";
import { cleanName, makeCode } from "@/lib/trivia/logic";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search.room === "string" ? search.room : "";
    return { room: raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) };
  },
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [creator, setCreator] = useState(false);

  if (name && search.room.length === 4) {
    return (
      <Showdown
        key={`${search.room}:${name}:${creator ? "host" : "guest"}`}
        room={search.room}
        name={name}
        creator={creator}
        onLeave={() => {
          setName(null);
          setCreator(false);
          void navigate({ search: { room: "" } });
        }}
      />
    );
  }

  return (
    <TriviaHome
      roomFromUrl={search.room}
      onCreate={(entered) => {
        setCreator(true);
        setName(cleanName(entered));
        void navigate({ search: { room: makeCode() } });
      }}
      onJoin={(entered, code) => {
        setCreator(false);
        setName(cleanName(entered));
        void navigate({ search: { room: code } });
      }}
    />
  );
}
