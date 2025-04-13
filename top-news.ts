import fs from "fs";
import path from "path";
import https from "https";

interface Story {
  url: string | null;
  num_comments: number;
  title: string;
  objectID: string;
  created_at: string;
}

const minScore = process.env.MIN_SCORE || 300;
const beaconsPath =
  process.env.BEACONS_PATH || path.resolve(__dirname, "beacons");
let remainingCalls = parseInt(process.env.MAX_POSTS || "4"); // May change if rate limit is lower

if (!process.env.DISCORD_HOOK) {
  console.error("Discord hook missing");
  process.exit(1);
}

function storyIsNew(id: string) {
  return !fs.existsSync(`${beaconsPath}/${id}.beacon`);
}

export async function postToDiscord(story: Story) {
  if (!process.env.DISCORD_HOOK) return;

  const hook = process.env.DISCORD_HOOK.replace(/.+\/webhooks\//, "");
  const opts = {
    hostname: "discordapp.com",
    path: `/api/webhooks/${hook}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  let description = "";
  if (story.url) {
    description += `[**Link**](${story.url}) • `;
  }
  description += `[${story.num_comments} comments](https://news.ycombinator.com/item?id=${story.objectID})`;

  const payload = {
    embeds: [
      {
        title: story.title,
        description,
        // url: story.url,
        color: 0xff6600,
        timestamp: story.created_at,
      },
    ],
  };

  return new Promise<void>((resolve, reject) => {
    const request = https.request(opts, (response) => {
      if (response.headers && response.headers["X-RateLimit-Remaining"]) {
        let newRemaining = parseInt(response.headers["X-RateLimit-Remaining"] as string);
        if (newRemaining < remainingCalls) {
          remainingCalls = newRemaining;
          console.warn(`Adjusted remaining calls to ${newRemaining}`);
        }
      }
    });

    request.on("error", reject);
    request.end(JSON.stringify(payload));
    resolve();
  });
}

function markStoryRead(id: string) {
  // Touch beacon file with story id
  const beacon = `${beaconsPath}/${id}.beacon`;
  fs.writeFile(beacon, "", (err) => {
    if (err) throw err;
  });
}

export function getNews() {
  return new Promise<Story[]>((resolve, reject) => {
    https.get(
      `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E${minScore}`,
      (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          const result = JSON.parse(data);
          if (result.hits) {
            resolve(result.hits);
          } else {
            reject();
          }
        });

        response.on("error", reject);
      }
    );
  });
}

export function checkStories(stories: Story[]) {
  for (let story of stories) {
    if (storyIsNew(story.objectID)) {
      remainingCalls--;
      postToDiscord(story)
        .then(() => markStoryRead(story.objectID))
        .catch((err) => console.error("Failed posting to Discord", err));
    }
    if (remainingCalls <= 0) break;
  }
}
