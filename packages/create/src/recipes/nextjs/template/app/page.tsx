import { client } from "@/gel";
import * as MessageBubble from "@/components/MessageBubble";

const query = "select 'hello world!'";

export default function ChatPage() {
  const queryPromise: Promise<string> = new Promise((resolve) => {
    // This query is so fast that we need to slow it down to see the loading state
    setTimeout(() => {
      resolve(client.queryRequiredSingle<string>(query));
    }, 2_000);
  });

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6">
        <MessageBubble.Container variant="sender" label="Next.js">
          <MessageBubble.Message variant="sender">
            Yo, Gel, run this query:
          </MessageBubble.Message>
          <MessageBubble.Message variant="sender">
            <code className="block font-bold">{query}</code>
          </MessageBubble.Message>
        </MessageBubble.Container>

        <MessageBubble.Container variant="receiver" label="Gel">
          <MessageBubble.Message variant="receiver" children={queryPromise} />
        </MessageBubble.Container>
      </div>
    </main>
  );
}
