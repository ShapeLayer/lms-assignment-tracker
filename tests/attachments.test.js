import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assignmentAttachments } from "../dist/adaptor/attachments.js";

test("collects unique assignment instruction files, excluding submitted files and external links", () => {
  const origin = "https://sel.jnu.ac.kr";
  const href =
    "/pluginfile.php?file=%2F2021323%2Fmod_assign%2Fintroattachment%2F0%2Freport.PPT&forcedownload=1";
  const files = assignmentAttachments(
    [
      { href, name: "보고서숙제#1.PPT" },
      { href, name: "보고서숙제#1.PPT" },
      {
        href: "/pluginfile.php?file=%2F2021323%2Fassignsubmission_file%2Fsubmission_files%2F0%2Fanswer.pdf",
        name: "제출 답안",
      },
      {
        href: "https://example.com/pluginfile.php?file=%2F2021323%2Fmod_assign%2Fintroattachment%2F0%2Freport.PPT",
        name: "외부 링크",
      },
    ],
    origin,
  );
  assert.deepEqual(files, [
    { name: "보고서숙제#1.PPT", url: new URL(href, origin).href },
  ]);
});
