import { client } from "@/gel";

export default async function Home() {
  return (
    <div className="text-4xl">
      {await client.queryRequiredSingle<string>(`select "Hello from Gel!"`)}
    </div>
  );
}
