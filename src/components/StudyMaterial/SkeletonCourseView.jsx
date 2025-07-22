const shimmer =
  "animate-pulse bg-gradient-to-r from-stone-200 via-stone-100 to-stone-200";

export default function SkeletonCourseView() {
  return (
    <div className="space-y-8">
      {/* Header Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
        <div className="flex flex-col gap-1 w-full max-w-lg">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full ${shimmer}`} />
            <div className={`h-8 w-40 rounded-lg ${shimmer}`} />
            <div className={`w-8 h-8 rounded-lg ${shimmer}`} />
          </div>
          <div className={`h-4 w-32 rounded ${shimmer} mt-2`} />
        </div>
        <div className="flex-1" />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-[300px]">
            <div
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded ${shimmer}`}
            />
            <div className={`w-full pl-9 pr-4 py-2 rounded-lg ${shimmer}`} />
          </div>
          <div className={`px-4 py-2 rounded-lg w-32 h-10 ${shimmer}`} />
        </div>
      </div>
      {/* File Card Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-stone-200 bg-white p-6 flex flex-col gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${shimmer}`} />
              <div className="flex-1">
                <div className={`h-4 w-32 rounded ${shimmer} mb-2`} />
                <div className={`h-3 w-20 rounded ${shimmer}`} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <div className={`w-8 h-8 rounded-lg ${shimmer}`} />
              <div className={`w-8 h-8 rounded-lg ${shimmer}`} />
              <div className={`w-8 h-8 rounded-lg ${shimmer}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
