# Flesh & Blood Proxy Maker

Build your own Flesh & Blood proxies in **true-to-size** cards at home! This is purely for personal testing/at home play.

## About

Card data comes from the open-source [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards)
database, refreshed automatically by a GitHub Action. This ensures new sets/printings/etc. are constantly added.

I made this because other proxy sites either (at the time):

* Keep an up-to-date database of cards, but never print accurately
* Print accurately, but aren't up-to-date.

I wanted to close that gap so folks like me can easily print proxies for home testing while they wait for their purchased product to arrive.

I also believe a website like this doesn't need to be fancy, a vanilla HTTP/CSS/JS approach really is all you need. I am by no means a front-end developer, but I at least wanted a responsive and mobile-friendly, static page.

Finally, I wanted to add some accessibility options by default. Flesh and Blood is an accessible TCG, fan projects should be as well.

## Feedback

Don't hesitate to open an issue or make a pull request! The page is scheduled to pull updates from `flesh-and-blood-cards` automatically, if something falls out of sync or doesn't look right, I'm happy to fix it/merge a pull request/track a feature request.

See [CHANGELOG.md](CHANGELOG.md) for the release history.

## Development

Want to test your own changes or run this locally? Ensure you have the following prerequisites:

* `python3`
* `node`
* `git`

 Simply clone the repo:

```bash
git clone https://github.com/tylerburdsall/fab-proxy-maker.git
cd fab-proxy-maker
```

Serve over HTTP (not `file://`, so `fetch` can load the JSON):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

To regenerate the card data locally:

```bash
git clone --depth 1 https://github.com/the-fab-cube/flesh-and-blood-cards source
node scripts/build-data.mjs source data/cards.min.json
```

## License

The source code in this repository is released under the [MIT License](LICENSE).

The MIT license covers the code only. It does **not** cover the card data (from
[the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards),
under its own license) or any Flesh and Blood™ card names, text, artwork, logos,
or set names, which are trademarks and © Legend Story Studios®.

This project is not affiliated with Legend Story Studios®. Flesh and Blood™,
card art, logos, and set names are property of Legend Story Studios®. Proxies are
for playtesting and casual use — not for sale or tournament play.
