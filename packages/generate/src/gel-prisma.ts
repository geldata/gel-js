import type { CommandOptions } from "./commandutil";
import type { Client } from "gel";
import * as fs from "node:fs";

const INTRO_QUERY = `
with module schema
select ObjectType {
    name,
    links: {
        name,
        readonly,
        required,
        cardinality,
        exclusive := exists (
            select .constraints
            filter .name = 'std::exclusive'
        ),
        target: {name},

        properties: {
            name,
            readonly,
            required,
            cardinality,
            exclusive := exists (
                select .constraints
                filter .name = 'std::exclusive'
            ),
            target: {name},
        },
    } filter .name != '__type__',
    properties: {
        name,
        readonly,
        required,
        cardinality,
        exclusive := exists (
            select .constraints
            filter .name = 'std::exclusive'
        ),
        target: {name},
    },
    backlinks := <array<str>>[],
}
filter
    not .builtin
    and
    not .internal
    and
    not re_test('^(std|cfg|sys|schema)::', .name);
`;

const MODULE_QUERY = `
with
    module schema,
    m := (select \`Module\` filter not .builtin)
select m.name;
`;

interface JSONField {
  name: string;
  readonly?: boolean;
  required?: boolean;
  exclusive?: boolean;
  cardinality: string;
  target: { name: string };
  has_link_target?: boolean;
  has_link_object?: boolean;
}

interface JSONLink extends JSONField {
  fwname?: string;
  properties?: JSONField[];
}

interface JSONType {
  name: string;
  links: JSONLink[];
  properties: JSONField[];
  backlinks: JSONLink[];
}

interface LinkTable {
  module: string;
  name: string;
  table: string;
  source: string;
  target: string;
}

interface TableObj {
  module: string;
  name: string;
  table: string;
  links: JSONField[];
  properties: JSONField[];
}

interface ProcessedSpec {
  modules: string[];
  object_types: JSONType[];
  link_tables: LinkTable[];
  link_objects: TableObj[];
  prop_objects: TableObj[];
}

interface MappedSpec {
  link_objects: { [key: string]: TableObj };
  object_types: { [key: string]: JSONType };
}

const CLEAN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ARRAY_RE = /^array<(.+)>$/;
const NAME_RE = /^(\w+?)(\d*)$/;

function warn(msg: string) {
  // This function exists in case we want to do something more with all the
  // warnings.
  console.warn(msg);
}

function getSQLName(name: string): string {
  // Just remove the module name
  return <string>name.split("::").pop();
}

function getMod(fullname: string): string {
  return <string>fullname.split("::").slice(0, -1).join("::");
}

function getModAndName(fullname: string): string[] {
  const mod = fullname.split("::");
  const name = <string>mod.pop();
  return [mod.join("::"), name];
}

function validName(name: string): boolean {
  // Just remove module separators and check the rest
  name = name.replace("::", "");
  if (!CLEAN_NAME.test(name)) {
    warn(`Non-alphanumeric names are not supported: ${name}`);
    return false;
  }
  return true;
}

async function getSchemaJSON(client: Client) {
  const types = <JSONType[]>await client.query(INTRO_QUERY);
  const modules = <string[]>await client.query(MODULE_QUERY);

  return processLinks(types, modules);
}

function _skipInvalidNames(
  spec_list: any[],
  recurse_into: string[] | null = null,
): any[] {
  const valid = [];
  for (const spec of spec_list) {
    // skip invalid names
    if (validName(spec.name)) {
      if (recurse_into) {
        for (const fname of recurse_into) {
          if (spec[fname]) {
            spec[fname] = _skipInvalidNames(spec[fname], recurse_into);
          }
        }
      }
      valid.push(spec);
    }
  }

  return valid;
}

function processLinks(types: JSONType[], modules: string[]): ProcessedSpec {
  // Figure out all the backlinks, link tables, and links with link properties
  // that require their own intermediate objects.
  const type_map: { [key: string]: JSONType } = {};
  const link_tables: LinkTable[] = [];
  const link_objects: TableObj[] = [];
  const prop_objects: TableObj[] = [];

  // All the names of types, props and links are valid beyond this point.
  types = _skipInvalidNames(types, ["properties", "links"]);
  for (const spec of types) {
    type_map[spec.name] = spec;
  }

  for (const spec of types) {
    const mod = getMod(spec.name);
    const sql_source = getSQLName(spec.name);

    for (const prop of spec.properties) {
      const name = prop.name;
      const exclusive = prop.exclusive;
      const cardinality = prop.cardinality;
      const sql_name = getSQLName(name);

      if (cardinality === "Many") {
        // Multi property will make its own "link table". But since it
        // doesn't link to any other object the link table itself must
        // be reflected as an object.
        const pobj: TableObj = {
          module: mod,
          name: `${sql_source}_${sql_name}_prop`,
          table: `${sql_source}.${sql_name}`,
          links: [
            {
              name: "source",
              required: true,
              cardinality: exclusive ? "One" : "Many",
              exclusive: false,
              target: { name: spec.name },
              has_link_object: false,
            },
          ],
          properties: [
            {
              name: "target",
              required: true,
              cardinality: "One",
              exclusive: false,
              target: prop.target,
              has_link_object: false,
            },
          ],
        };
        prop_objects.push(pobj);
      }
    }

    for (const link of spec.links) {
      if (link.name != "__type__") {
        const name = link.name;
        const target = link.target.name;
        const cardinality = link.cardinality;
        const exclusive = link.exclusive;
        const sql_name = getSQLName(name);

        const objtype = type_map[target];
        objtype.backlinks.push({
          name: `bk_${name}_${sql_source}`,
          fwname: name,
          // flip cardinality and exclusivity
          cardinality: exclusive ? "One" : "Many",
          exclusive: cardinality === "One",
          target: { name: spec.name },
          has_link_object: false,
        });

        link.has_link_object = false;
        // Any link with properties should become its own intermediate
        // object, since ORMs generally don't have a special convenient
        // way of exposing this as just a link table.
        if (link.properties!.length > 2) {
          // more than just 'source' and 'target' properties
          const lobj: TableObj = {
            module: mod,
            name: `${sql_source}_${sql_name}_link`,
            table: `${sql_source}.${sql_name}`,
            links: [],
            properties: [],
          };
          for (const prop of link.properties!) {
            if (prop.name === "source" || prop.name === "target") {
              lobj.links.push(prop);
            } else {
              lobj.properties.push(prop);
            }
          }

          link_objects.push(lobj);
          link["has_link_object"] = true;
          objtype["backlinks"][-1]["has_link_object"] = true;
        } else if (cardinality === "Many") {
          // Add a link table for One-to-Many and Many-to-Many
          link_tables.push({
            module: mod,
            name: `${sql_source}_${sql_name}_table`,
            table: `${sql_source}.${sql_name}`,
            source: spec.name,
            target: target,
          });
        }
      }
    }
  }

  return {
    modules: modules,
    object_types: types,
    link_tables: link_tables,
    link_objects: link_objects,
    prop_objects: prop_objects,
  };
}

const GEL_SCALAR_MAP: { [key: string]: string } = {
  "std::uuid": "String @db.Uuid",
  "std::bigint": "Decimal",
  "std::bool": "Boolean",
  "std::bytes": "Bytes",
  "std::decimal": "Decimal",
  "std::float32": "Float",
  "std::float64": "Float",
  "std::int16": "Int",
  "std::int32": "Int",
  "std::int64": "BigInt",
  "std::json": "Json",
  "std::str": "String",
  "std::datetime": "DateTime",
};

const BASE_STUB = `\
// Automatically generated from Gel schema.
// Do not edit directly as re-generating this file will overwrite any changes.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

function field_name_sort(a: unknown[], b: unknown[]) {
  const a_match = NAME_RE.exec(<string>a[0]);
  const b_match = NAME_RE.exec(<string>b[0]);

  const a_val = [a_match![1], Number(a_match![2] || -1)];
  const b_val = [b_match![1], Number(b_match![2] || -1)];

  if (a_val < b_val) {
    return -1;
  } else if (a_val > b_val) {
    return 1;
  } else {
    return 0;
  }
}

class ModelClass {
  name: string;
  table?: string;
  props: { [key: string]: string } = {};
  links: { [key: string]: string } = {};
  mlinks: { [key: string]: string } = {};
  backlinks: { [key: string]: string } = {};
  isLinkTable: boolean = false;

  constructor(name: string) {
    this.name = name;
  }

  getBacklinkName(src_link: string, src_name: string): string {
    return `bk_${src_link}_${src_name}`;
  }
}

class ModelGenerator {
  INDENT = "  ";
  outfile: string;
  out: string[] = [];
  _indentLevel: number = 0;

  constructor(outfile: string) {
    this.outfile = outfile;
    this._indentLevel = 0;
  }

  indent() {
    this._indentLevel += 1;
  }

  dedent() {
    if (this._indentLevel > 0) {
      this._indentLevel -= 1;
    }
  }

  resetIndent() {
    this._indentLevel = 0;
  }

  write(text: string = "") {
    for (const line of text.split("\n")) {
      this.out.push(`${this.INDENT.repeat(this._indentLevel)}${line}`);
    }
  }

  renderOutput() {
    fs.writeFileSync(this.outfile, BASE_STUB + this.out.join("\n"));
  }

  specToModulesDict(spec: ProcessedSpec) {
    const modules: { [key: string]: MappedSpec } = {};

    for (const mod of spec["modules"].sort()) {
      modules[mod] = { link_objects: {}, object_types: {} };
    }

    // convert link tables into full link objects
    for (const rec of spec.link_tables) {
      const mod = rec.module;
      modules[mod].link_objects[rec.table] = {
        module: mod,
        name: rec.name.replace(/_table$/, "_link"),
        table: rec.table,
        links: [
          {
            name: "source",
            required: true,
            cardinality: "One",
            target: { name: rec.source },
            has_link_object: false,
          },
          {
            name: "target",
            required: true,
            cardinality: "One",
            target: { name: rec.target },
            has_link_object: false,
          },
        ],
        properties: [],
      };
    }

    for (const rec of spec.link_objects) {
      const mod = rec.module;
      modules[mod].link_objects[rec.table] = rec;
    }

    for (const rec of spec.object_types) {
      const [mod, name] = getModAndName(rec.name);
      modules[mod].object_types[name] = rec;
    }

    return modules["default"];
  }

  buildModels(maps: MappedSpec) {
    const modmap: { [key: string]: ModelClass } = {};

    for (const [name, rec] of Object.entries(maps.object_types)) {
      const mod: ModelClass = new ModelClass(name);
      mod.table = name;

      // copy backlink information
      for (const link of rec.backlinks) {
        const code = this.renderBacklinkLink(link);
        if (code) {
          mod.backlinks[link.name] = code;
        }
      }

      // process properties as fields
      for (const prop of rec.properties) {
        const pname = prop.name;
        if (pname === "id" || prop.cardinality === "Many") {
          continue;
        }

        const code = this.renderProp(prop);
        if (code) {
          mod.props[pname] = code;
        }
      }

      // process single links as fields
      for (const link of rec.links) {
        if (link.cardinality === "One") {
          const lname = link.name;
          const bklink = mod.getBacklinkName(lname, name);
          const code = this.renderSingleLink(link, bklink);
          if (code) {
            mod.links[lname] = code;
            // corresponding foreign key field
            const opt = link["required"] ? "" : "?";
            mod.props[lname + "_id"] = `String${opt}    @db.Uuid`;
          }
        }
      }

      modmap[mod.name] = mod;
    }

    for (const [table, rec] of Object.entries(maps.link_objects)) {
      const [source, fwname] = table.split(".");
      const mod = new ModelClass(`${source}_${fwname}`);
      mod.table = table;
      mod.isLinkTable = true;

      // Must have source and target
      let target: string;
      for (const prop of rec.links) {
        const [mtgt, tar] = getModAndName(prop.target.name);
        if (mtgt !== "default") {
          // skip this whole link table
          warn(
            `Skipping link ${fwname}: link target ${mtgt + "::" + tar} ` +
              `is not supported`,
          );
          continue;
        }
        if (prop.name === "target") {
          target = tar;
        }
      }

      mod.props["source_id"] = `String    @map("source")    @db.Uuid`;
      mod.props["target_id"] = `String    @map("target")    @db.Uuid`;

      // Get source and target models and reconcile them with the link table
      const src = modmap[source];
      const tgt = modmap[target!];
      const bkname = src.getBacklinkName(fwname, src.name);

      mod.links["target"] =
        `${target!}    @relation("${mod.name}", ` +
        `fields: [target_id], references: [id], ` +
        `onUpdate: NoAction, onDelete: NoAction)`;
      mod.links["source"] =
        `${source}    @relation("${bkname}", ` +
        `fields: [source_id], references: [id], ` +
        `onUpdate: NoAction, onDelete: NoAction)`;
      // Update the source and target models with the corresponding
      // ManyToManyField.
      src.mlinks[fwname] = `${mod.name}[]    @relation("${bkname}")`;
      tgt.mlinks[bkname] = `${mod.name}[]    @relation("${mod.name}")`;
      delete src.links[fwname];
      delete tgt.backlinks[bkname];

      // process properties if any
      for (const prop of rec["properties"]) {
        const pname = prop.name;
        const code = this.renderProp(prop);
        if (code) {
          mod.props[pname] = code;
        }
      }

      modmap[mod.name] = mod;
    }

    return modmap;
  }

  renderProp(prop: JSONField): string {
    let target = prop.target.name;
    let is_array = false;
    const match = ARRAY_RE.exec(target);
    if (match) {
      is_array = true;
      target = match[1];
    }

    const type: string | undefined = GEL_SCALAR_MAP[target];

    if (type === undefined) {
      warn(`Scalar type ${target} is not supported`);
      return "";
    }
    // make props opional and let gel deal with the actual requirements
    if (is_array) {
      return type + "[]";
    } else {
      return type + "?";
    }
  }

  renderSingleLink(link: JSONLink, bklink: string): string {
    const opt = link.required ? "" : "?";
    const [mod, target] = getModAndName(link.target.name);

    if (mod !== "default") {
      warn(
        `Skipping link ${link.name}: link target ${link.target.name} ` +
          `is not supported`,
      );
      return "";
    }

    return (
      `${target}${opt}    @relation("${bklink}", ` +
      `fields: [${link.name}_id], references: [id], ` +
      `onUpdate: NoAction, onDelete: NoAction)`
    );
  }

  renderBacklinkLink(link: JSONLink): string {
    const multi = link.cardinality === "One" ? "?" : "[]";
    const [mod, target] = getModAndName(link.target.name);

    if (mod !== "default") {
      warn(
        `Skipping link ${link.name}: link target ${link.target.name} ` +
          `is not supported`,
      );
      return "";
    }

    return `${target}${multi}    @relation("${link.name}")`;
  }

  renderModels(spec: ProcessedSpec) {
    const mods = spec.modules;
    if (mods[0] != "default" || mods.length > 1) {
      const skipped = mods.filter((m) => m != "default").join(", ");
      warn(
        `Skipping modules ${skipped}: Prisma reflection doesn't support` +
          "multiple modules or non-default modules.",
      );
    }

    if (spec.prop_objects.length > 0) {
      warn(
        "Skipping multi properties: Prisma reflection doesn't support multi" +
          "properties as they produce models without 'id' field.",
      );
    }

    const maps = this.specToModulesDict(spec);
    const modmap = this.buildModels(maps);
    const values = Object.values(modmap);
    values.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      } else if (a.name == b.name) {
        return 0;
      } else {
        return 1;
      }
    });

    for (const mod of values) {
      this.write();
      this.renderModelClass(mod);
    }

    this.renderOutput();
  }

  renderModelClass(mod: ModelClass) {
    this.write(`model ${mod.name} {`);
    this.indent();

    if (!mod.isLinkTable) {
      this.write(
        'id    String    @id    @default(dbgenerated("uuid_generate_v4()"))' +
          "    @db.Uuid",
      );
      // not actually using this default, but this prevents Prisma from sending null
      this.write(
        'gel_type_id    String    @default(dbgenerated("uuid_generate_v4()"))' +
          '    @map("__type__")    @db.Uuid',
      );
    }

    if (Object.keys(mod.props).length > 0) {
      this.write();
      this.write("// properties");
      const props = Object.entries(mod.props);
      props.sort(field_name_sort);
      for (const [name, val] of props) {
        this.write(`${name}    ${val}`);
      }
    }

    if (Object.keys(mod.links).length > 0) {
      this.write();
      this.write("// links");
      const links = Object.entries(mod.links);
      links.sort(field_name_sort);
      for (const [name, val] of links) {
        this.write(`${name}    ${val}`);
      }
    }

    if (Object.keys(mod.mlinks).length > 0) {
      this.write();
      this.write("// multi-links");
      const mlinks = Object.entries(mod.mlinks);
      mlinks.sort(field_name_sort);
      for (const [name, val] of mlinks) {
        this.write(`${name}    ${val}`);
      }
    }

    if (Object.keys(mod.backlinks).length > 0) {
      this.write();
      this.write("// backlinks");
      const backlinks = Object.entries(mod.backlinks);
      backlinks.sort(field_name_sort);
      for (const [name, val] of backlinks) {
        this.write(`${name}    ${val}`);
      }
    }

    this.write();
    if (mod.isLinkTable) {
      this.write("@@id([source_id, target_id])");
    }
    this.write(`@@map("${mod.table}")`);

    this.dedent();
    this.write(`}`);
  }
}

export async function runGelPrismaGenerator(params: {
  options: CommandOptions;
  client: Client;
}) {
  const spec = await getSchemaJSON(params.client);
  const gen = new ModelGenerator(params.options.file!);
  gen.renderModels(spec);
}
