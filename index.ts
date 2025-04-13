import { Cron } from "croner";
import { checkStories, getNews } from "./top-news";

new Cron("*/10 * * * *", () => {
  getNews()
    .then(checkStories)
    .catch(() => console.error("Couldn't fetch news"));
});
