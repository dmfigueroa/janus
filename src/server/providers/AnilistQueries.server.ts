export const ANILIST_SEARCH_QUERY = `
  query ($search: String, $type: MediaType, $page: Int, $perPage: Int) {
    Page (page: $page, perPage: $perPage) {
      pageInfo {
        total
        hasNextPage
      }
      media (search: $search, type: $type) {
        id
        title {
          romaji
          english
        }
        type
        description
        startDate {
          year
        }
        averageScore
        coverImage {
          large
          extraLarge
        }
        bannerImage
      }
    }
  }
`;

export const ANILIST_DETAILS_QUERY = `
  query ($id: Int) {
    Media (id: $id) {
      id
      title {
        romaji
        english
      }
      type
      description
      startDate {
        year
        month
        day
      }
      averageScore
      coverImage {
        large
        extraLarge
      }
      bannerImage
      episodes
      chapters
      volumes
    }
  }
`;
