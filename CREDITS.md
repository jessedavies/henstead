# Audio credits (Henstead)

All files are CC0 or public domain; attribution is given as a courtesy. Clips were trimmed, normalised and converted to MP3.

| File | Source | Author | Licence |
|---|---|---|---|
| music.mp3 | "Apple Cider", opengameart.org/content/apple-cider | Zane Little Music | CC0 |
| birds.mp3 | "Park ambiences" (birds), opengameart.org/content/park-ambiences | Thimras | CC0 |
| bark.mp3 | "Dog barking mono", opengameart.org/content/dog-barking-mono | HaelDB | CC0 (also OGA-BY 3.0) |
| pop1-3.mp3 | "3 Pop Sounds", opengameart.org/content/3-pop-sounds | wubitog | CC0 |
| cluck1-4.mp3 | "Chickens demanding food.ogg", commons.wikimedia.org | alys | Public domain |
| cackle.mp3 | "Hen announcing shes lain an egg.ogg", commons.wikimedia.org | alys | Public domain |
| crow.mp3 | "Medium rooster crowing.ogg", commons.wikimedia.org | alys | Public domain |

Whistles, the hawk, the fox and interface tones are synthesised in code.

# 3D models (Henstead)

Models are from Kay Lousberg's KayKit packs (www.kaylousberg.com, kaylousberg.itch.io), licensed CC0. The free tier of each pack was used.

| Used for | Pack | Models |
|---|---|---|
| Trees, bushes, rocks, grass | KayKit Forest Nature Pack | Tree_1/2/4, Bush_1-4, Rock_1, Grass_1/2 |
| Coop, feed field, fences, gate, well, barrel, wheelbarrow | KayKit Medieval Hexagon Pack | building_home_A_red, building_grain, fence_wood_straight(_gate), building_well_red, barrel, wheelbarrow |
| Hens, rooster, chicks, flowers | KayKit Mixed Bag 1 | chicken_plushie_A/B, flax_flower_A/B |
| Lantern, bench, pumpkins | KayKit Halloween Bits | post_lantern, bench, pumpkin_orange(_small) |
| Vegetable crate | KayKit Restaurant Bits | crate_carrots |
| Log pile | KayKit Resource Bits | Wood_Log_Stack |
| Dog (repainted as a border collie) | KayKit Mini-Game Variety Pack | character_dog |
| Farmer and animations | KayKit Adventurers | Ranger, Rig_Medium_MovementBasic, Rig_Medium_General |

`tools/pack_models.py` packs the models listed in `tools/models.json` into `assets/models/`; `tools/recolor.py` repaints the dog. The fox, hawk, snake, scarecrow and eggs are still built from primitives in `src/models.ts`.
