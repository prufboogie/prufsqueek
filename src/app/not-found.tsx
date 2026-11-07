import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="eyebrow">Off the map</p>
      <h1 className="stencil mt-2 text-5xl">Nothing out here</h1>
      <p className="mt-3 text-bone-dim">That part of the district is rubble. Head back before dark.</p>
      <Link href="/" className="btn btn-hazard mt-6">Back to the district</Link>
    </div>
  );
}
