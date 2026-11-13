/**
 * Data schemas for an aircraft's content and geometry.
 *
 * The app imports only the TYPES from this file (`import type`), so zod is
 * never bundled. `scripts/validate.ts` uses the schemas themselves to check
 * the JSON files before every build.
 *
 * Conventions
 *  - Text that the learner reads is always `{ en, ar }`.
 *  - Coordinates are metres in the aircraft frame:
 *      origin = nose tip projected onto the ground, on the centreline
 *      +X = aft, +Y = up, +Z = port (left side, seen from the cockpit)
 *  - Rotations are Euler angles in degrees, XYZ order.
 *  - `mirror: true` duplicates an item to the other side (z -> -z).
 */
import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)
export const LocalText = z.object({ en: nonEmpty, ar: nonEmpty }).strict()
export const LocalParagraphs = z
  .object({ en: z.array(nonEmpty).min(1), ar: z.array(nonEmpty).min(1) })
  .strict()
export const Vec3 = z.tuple([z.number(), z.number(), z.number()])
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case words joined by "-"')
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colours are #rrggbb')

// ---------- parts.json: every clickable thing, exterior or internal ----------
export const Media = z
  .object({
    type: z.enum(['image', 'video', 'youtube']),
    src: nonEmpty,
    caption: LocalText.optional(),
    poster: z.string().optional(),
  })
  .strict()

export const Part = z
  .object({
    id,
    kind: z.enum(['exterior', 'component']),
    system: id,
    name: LocalText,
    short: LocalText,
    details: LocalParagraphs,
    location: LocalText.optional(),
    media: z.array(Media).optional(),
    /** Reserved for the detailed sub-model phase (e.g. the engine drill-down). */
    subModel: z.string().nullable().optional(),
  })
  .strict()
export const PartsFile = z.object({ parts: z.array(Part).min(1) }).strict()

// ---------- mapping.json: which bit of the 3D model is which part ----------
export const Volume = z
  .object({
    shape: z.enum(['box', 'ellipsoid']),
    center: Vec3,
    size: Vec3,
    rotation: Vec3.optional(),
    mirror: z.boolean().optional(),
    /**
     * Limit this volume to these objects of the model. Use it to cut a region
     * out of one object: the rudder out of a one-piece fin, the radome out of
     * the fuselage. Such a volume also applies to objects that another entry
     * claims by name.
     */
    meshes: z.array(nonEmpty).optional(),
  })
  .strict()

export const MappingEntry = z
  .object({
    partId: id,
    /** Mesh or node names in the model that belong wholly to this part. */
    meshes: z.array(nonEmpty).optional(),
    /** Regions of the model; triangles whose centre falls inside go to this part. */
    volumes: z.array(Volume).optional(),
    /** Where the hotspot dot sits and what the camera looks at. */
    anchor: Vec3.optional(),
  })
  .strict()
export const MappingFile = z
  .object({
    /** Part that receives every triangle not matched by a name or a volume. */
    fallback: id,
    /** Order matters: earlier entries win when volumes overlap. */
    entries: z.array(MappingEntry),
  })
  .strict()

// ---------- systems.json: categories and the internal systems layer ----------
export const Circuit = z.object({ id, name: LocalText, color }).strict()

const surfaceRef = z.enum(['wing', 'hstab', 'fin'])
export const Component = z
  .object({
    partId: id,
    circuit: id.optional(),
    shape: z.enum(['box', 'cylinder', 'capsule', 'ellipsoid', 'panel', 'seats']),
    /**
     * 'solid' (default) is an opaque coloured shape. 'volume' is a see-through
     * box with edges, for compartments you should be able to look into.
     */
    style: z.enum(['solid', 'volume']).optional(),
    /** Required for every shape except 'panel'. For 'seats': centre of the first row, on the floor. */
    position: Vec3.optional(),
    /** box/ellipsoid: full size. cylinder/capsule: [diameter, length, diameter] along local Y. */
    size: Vec3.optional(),
    rotation: Vec3.optional(),
    mirror: z.boolean().optional(),
    /** 'panel' only: a slice of a lifting surface, as fractions of its span and chord. */
    surface: surfaceRef.optional(),
    span: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
    chord: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
    /** 'panel' only: thickness relative to the real surface. Below 1 sits inside the skin (tanks), above 1 stands proud. Default 0.72. */
    thickness: z.number().positive().max(2).optional(),
    /** 'seats' only: number of rows, distance between rows, and seats each side of the aisle. */
    rows: z.number().int().positive().optional(),
    pitch: z.number().positive().optional(),
    abreast: z.tuple([z.number().int().min(1).max(4), z.number().int().min(1).max(4)]).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.shape === 'panel') {
      if (!c.surface || !c.span || !c.chord)
        ctx.addIssue({ code: 'custom', message: `panel "${c.partId}" needs surface, span and chord` })
    } else if (c.shape === 'seats') {
      if (!c.position || !c.rows || !c.pitch)
        ctx.addIssue({ code: 'custom', message: `seats "${c.partId}" need position, rows and pitch` })
    } else if (!c.position || !c.size) {
      ctx.addIssue({ code: 'custom', message: `component "${c.partId}" needs position and size` })
    }
  })

export const RouteEnd = z.union([id, Vec3])
export const Route = z
  .object({
    id,
    partId: id.optional(),
    circuit: id.optional(),
    /** A component partId (the pipe starts at its centre) or a point. */
    from: RouteEnd,
    to: RouteEnd,
    via: z.array(Vec3),
    radius: z.number().positive().max(0.5),
    /** 1 = flows from -> to, -1 = reverse, omitted = no animation. */
    flow: z.union([z.literal(1), z.literal(-1)]).optional(),
    mirror: z.boolean().optional(),
  })
  .strict()

export const System = z
  .object({
    id,
    name: LocalText,
    color,
    circuits: z.array(Circuit).optional(),
    /** Always show a dot on each component: for small, scattered items such as service points. */
    markers: z.boolean().optional(),
    /** A system with no components is a category only and is not listed in the Systems view. */
    components: z.array(Component).default([]),
    routes: z.array(Route).default([]),
  })
  .strict()
export const SystemsFile = z.object({ systems: z.array(System).min(1) }).strict()

// ---------- aircraft.json: the model, its frame and its lifting surfaces ----------
export const Surface = z
  .object({
    rootLE: Vec3,
    rootChord: z.number().positive(),
    tipLE: Vec3,
    tipChord: z.number().positive(),
    /** Thickness / chord at root and tip. */
    thickness: z.tuple([z.number().positive(), z.number().positive()]),
    /** Unit vector the thickness is measured along (up for wings, sideways for the fin). */
    normal: Vec3,
    mirror: z.boolean().optional(),
  })
  .strict()

export const AircraftFile = z
  .object({
    id,
    name: LocalText,
    manufacturer: LocalText.optional(),
    /** Short type name shown large on the nameplate, the intro and the hangar floor, e.g. "A320". Defaults to the name. */
    designation: nonEmpty.optional(),
    /** One line under the name: what kind of aircraft this is. */
    tagline: LocalText.optional(),
    /** Headline figures for the intro screen and the top of the data sheet. Write the unit after a space ("37.57 m"). */
    highlights: z.array(z.object({ label: LocalText, value: LocalText }).strict()).max(6).optional(),
    /** Path under public/, or "placeholder" for the built-in procedural airliner. */
    model: nonEmpty,
    frame: z
      .object({ scale: z.number().positive(), rotation: Vec3, offset: Vec3 })
      .strict(),
    camera: z.object({ position: Vec3, target: Vec3, fov: z.number().min(10).max(90) }).strict(),
    surfaces: z.object({ wing: Surface, hstab: Surface, fin: Surface }).strict(),
    /**
     * The constant fuselage section, for the frames drawn in the Systems view:
     * centreline height, half width, vertical stretch, the stations where the
     * section starts and ends, and the cabin floor height.
     */
    fuselage: z
      .object({ yc: z.number(), r: z.number().positive(), ky: z.number().positive(), from: z.number(), to: z.number(), floor: z.number() })
      .strict()
      .optional(),
    credits: z
      .array(
        z
          .object({
            title: nonEmpty,
            author: nonEmpty,
            license: nonEmpty,
            url: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    disclaimer: LocalText.optional(),
    /** Data sheet shown when no part is selected. */
    specs: z
      .array(
        z
          .object({
            title: LocalText,
            rows: z.array(z.object({ label: LocalText, value: LocalText }).strict()).min(1),
          })
          .strict(),
      )
      .default([]),
    /** Where the figures and positions come from. */
    sources: z.array(z.object({ title: nonEmpty, url: z.string().optional(), note: LocalText.optional() }).strict()).default([]),
  })
  .strict()

export type LocalText = z.infer<typeof LocalText>
export type V3 = z.infer<typeof Vec3>
export type Part = z.infer<typeof Part>
export type Media = z.infer<typeof Media>
export type Volume = z.infer<typeof Volume>
export type MappingEntry = z.infer<typeof MappingEntry>
export type Mapping = z.infer<typeof MappingFile>
export type Circuit = z.infer<typeof Circuit>
export type Component = z.infer<typeof Component>
export type Route = z.infer<typeof Route>
export type System = z.infer<typeof System>
export type Surface = z.infer<typeof Surface>
export type Aircraft = z.infer<typeof AircraftFile>
